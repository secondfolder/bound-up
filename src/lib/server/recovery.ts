import { and, count, eq, gt, inArray, or } from 'drizzle-orm';
import { type KeyWrapParams, normaliseEmail, toBase64Url } from '../encryption';
import { setPasswordHashStatement } from './credentials';
import type { Db } from './db';
import {
	accountRecoveryRequests,
	historyRestoreRequests,
	partnerships,
	passkey,
	session,
	user,
	userKeys,
	userKeyWraps
} from './db/schema';

/**
 * Partner-assisted sign-in: getting back into an account after losing every
 * way in.
 *
 * The flow, and why each piece is shaped as it is, is in
 * docs/account-recovery.md. In short:
 *
 * 1. `startAccountRecovery` — unauthenticated. Stores the requester's new
 *    public key and password wrap, opens a restore request in each of their
 *    partnerships, and hands back a token.
 * 2. A partner compares a code and re-encrypts their shared history; the final
 *    page of that approves the sign-in (`applyHistoryRestore` in
 *    `messaging.ts`).
 * 3. `completeAccountRecovery` — authorised by the token. Swaps in the new
 *    keys and password, and wipes every other way into the account.
 *
 * KNOWN GAP, on purpose and written down: nothing here proves the requester
 * controls the account's email address. Until email verification exists, a
 * partner can file a request for someone else's email, approve it themselves,
 * and sign in as them. See "Not built yet" in docs/account-recovery.md.
 */

/** How long a request stays open. Long enough for a partner to be reached. */
export const RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
/** Per email per hour. Low: a real person needs one, maybe a retry. */
export const MAX_REQUESTS_PER_EMAIL = 3;
/** Per address per hour. Higher, because people share addresses. */
export const MAX_REQUESTS_PER_IP = 10;

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A keyed hash, for the email and IP columns.
 *
 * Keyed with the auth secret rather than plain SHA-256: an IPv4 address and a
 * typical email are guessable, so an unkeyed hash of either is reversible by
 * anyone holding the table. Keyed, a leaked table says nothing on its own.
 */
async function keyedHash(secret: string, purpose: string, value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}|${value}`)));
}

/** The token is random, so a plain digest is enough to make the column useless. */
async function tokenHash(token: string): Promise<string> {
	return hex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}

export type StartRecoveryResult =
	| { ok: true; token: string }
	| { ok: false; reason: 'rate-limited' };

/**
 * Opens a request. Behaves the same whether or not the account exists.
 *
 * That is the rule every line here is written around. Answering "no such
 * account", or "that account has no partner", would turn this unauthenticated
 * endpoint into a way to check whether someone uses the app — so an unknown
 * email still gets a row (with no user), still counts towards the rate limit,
 * and still gets a token back. It is simply never approved.
 */
export async function startAccountRecovery(
	db: Db,
	input: {
		email: string;
		recipient: string;
		wrap: { params: KeyWrapParams; blob: string };
		ip: string | null;
		secret: string;
	},
	now: Date = new Date()
): Promise<StartRecoveryResult> {
	const emailHash = await keyedHash(input.secret, 'recovery-email', normaliseEmail(input.email));
	const ipHash = input.ip ? await keyedHash(input.secret, 'recovery-ip', input.ip) : null;
	const since = new Date(now.getTime() - RATE_WINDOW_MS);

	const [byEmail, byIp] = await Promise.all([
		db
			.select({ n: count() })
			.from(accountRecoveryRequests)
			.where(
				and(
					eq(accountRecoveryRequests.emailHash, emailHash),
					gt(accountRecoveryRequests.createdAt, since)
				)
			),
		ipHash
			? db
					.select({ n: count() })
					.from(accountRecoveryRequests)
					.where(
						and(
							eq(accountRecoveryRequests.ipHash, ipHash),
							gt(accountRecoveryRequests.createdAt, since)
						)
					)
			: Promise.resolve([{ n: 0 }])
	]);
	if ((byEmail[0]?.n ?? 0) >= MAX_REQUESTS_PER_EMAIL || (byIp[0]?.n ?? 0) >= MAX_REQUESTS_PER_IP) {
		return { ok: false, reason: 'rate-limited' };
	}

	// Better Auth stores addresses lowercased; normalising matches that.
	const [account] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, normaliseEmail(input.email)))
		.limit(1);
	const partnershipRows = account
		? await db
				.select({ id: partnerships.id })
				.from(partnerships)
				.where(
					and(
						eq(partnerships.status, 'accepted'),
						or(eq(partnerships.inviterId, account.id), eq(partnerships.inviteeId, account.id))
					)
				)
		: [];

	const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
	const id = crypto.randomUUID();

	// A new request replaces an older pending one, so a partner is never shown
	// two codes and left to guess which is current. The older one's restore
	// requests go with it.
	const superseded = await db
		.select({ id: accountRecoveryRequests.id })
		.from(accountRecoveryRequests)
		.where(
			and(
				eq(accountRecoveryRequests.emailHash, emailHash),
				eq(accountRecoveryRequests.status, 'pending')
			)
		);
	const supersededIds = superseded.map((row) => row.id);

	await db.batch([
		db
			.update(accountRecoveryRequests)
			.set({ status: 'superseded', resolvedAt: now })
			.where(
				and(
					eq(accountRecoveryRequests.emailHash, emailHash),
					eq(accountRecoveryRequests.status, 'pending')
				)
			),
		db
			.update(historyRestoreRequests)
			.set({ status: 'declined', resolvedAt: now })
			.where(
				and(
					inArray(historyRestoreRequests.recoveryRequestId, supersededIds),
					eq(historyRestoreRequests.status, 'pending')
				)
			),
		db.insert(accountRecoveryRequests).values({
			id,
			userId: account?.id ?? null,
			emailHash,
			ipHash,
			tokenHash: await tokenHash(token),
			recipient: input.recipient,
			wrapParams: input.wrap.params,
			wrapBlob: input.wrap.blob,
			expiresAt: new Date(now.getTime() + RECOVERY_TTL_MS),
			createdAt: now
		}),
		// One per partnership: any partner can help, and each one's history is
		// theirs to re-encrypt. Whoever finishes first approves the sign-in.
		...(account
			? partnershipRows.map((partnership) =>
					db.insert(historyRestoreRequests).values({
						partnershipId: partnership.id,
						requesterId: account.id,
						requestedRecipient: input.recipient,
						recoveryRequestId: id
					})
				)
			: [])
	]);

	return { ok: true, token };
}

/** What the waiting requester's page is told. */
export type RecoveryStatus = 'pending' | 'approved' | 'declined' | 'expired' | 'completed';

async function findByToken(db: Db, token: string) {
	const [row] = await db
		.select({
			id: accountRecoveryRequests.id,
			userId: accountRecoveryRequests.userId,
			status: accountRecoveryRequests.status,
			expiresAt: accountRecoveryRequests.expiresAt,
			recipient: accountRecoveryRequests.recipient,
			wrapParams: accountRecoveryRequests.wrapParams,
			wrapBlob: accountRecoveryRequests.wrapBlob
		})
		.from(accountRecoveryRequests)
		.where(eq(accountRecoveryRequests.tokenHash, await tokenHash(token)))
		.limit(1);
	return row ?? null;
}

/**
 * Where a request stands, for the requester's page to poll.
 *
 * An unknown token reads as `expired`, so a guessed token learns nothing. A
 * request for an unknown email stays `pending` until it expires, like one
 * nobody has answered yet. `declined` means every partner who was asked said
 * the code did not match.
 */
export async function recoveryStatus(
	db: Db,
	token: string,
	now: Date = new Date()
): Promise<RecoveryStatus> {
	const row = await findByToken(db, token);
	if (!row || row.status === 'superseded') {
		return 'expired';
	}
	if (row.status === 'completed' || row.status === 'approved' || row.status === 'declined') {
		return row.status;
	}
	if (row.expiresAt <= now) {
		return 'expired';
	}

	const restores = await db
		.select({ status: historyRestoreRequests.status })
		.from(historyRestoreRequests)
		.where(eq(historyRestoreRequests.recoveryRequestId, row.id));
	if (restores.length > 0 && restores.every((restore) => restore.status === 'declined')) {
		return 'declined';
	}
	return 'pending';
}

export type CompleteRecoveryResult =
	| { ok: true; userId: string }
	| { ok: false; reason: 'not-approved' | 'expired' };

/**
 * Finishes an approved request: the requester's new keys and password become
 * the account's, and every other way in is removed.
 *
 * `passwordHash` is Better Auth's own hash of the new `authSecret`, computed by
 * the caller — the secret arrives only now, so no login credential ever sat in
 * the recovery table.
 *
 * One `db.batch()`, because every half-state is worse than either end: new
 * keys with the old password leave an account nobody can open; a new password
 * with the old keys signs in to history that cannot be read. What it removes,
 * and why:
 *
 * - **Every wrap** — they open the old identity, which is gone.
 * - **Every passkey** — none can open the new identity, and one left behind
 *   would sign in to a device that could never get its key.
 * - **Every session** — whoever holds the lost devices is signed out.
 */
export async function completeAccountRecovery(
	db: Db,
	input: { token: string; passwordHash: string },
	now: Date = new Date()
): Promise<CompleteRecoveryResult> {
	const row = await findByToken(db, input.token);
	if (!row?.userId || row.expiresAt <= now) {
		return { ok: false, reason: 'expired' };
	}
	if (row.status !== 'approved') {
		return { ok: false, reason: 'not-approved' };
	}
	const { userId } = row;

	await db.batch([
		db.update(userKeys).set({ recipient: row.recipient }).where(eq(userKeys.userId, userId)),
		db.delete(userKeyWraps).where(eq(userKeyWraps.userId, userId)),
		db.insert(userKeyWraps).values({
			userId,
			type: 'password',
			params: row.wrapParams,
			blob: row.wrapBlob
		}),
		db.delete(passkey).where(eq(passkey.userId, userId)),
		setPasswordHashStatement(db, userId, input.passwordHash),
		db.delete(session).where(eq(session.userId, userId)),
		db
			.update(accountRecoveryRequests)
			.set({ status: 'completed', resolvedAt: now })
			.where(eq(accountRecoveryRequests.id, row.id))
	]);

	return { ok: true, userId };
}
