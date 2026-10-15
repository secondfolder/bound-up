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
import { hex, keyedHash } from './keyed-hash';

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
 * 2. Two things, in either order. A partner compares a code and re-encrypts
 *    their shared history, the final page of which approves the sign-in
 *    (`applyHistoryRestore` in `messaging.ts`). And the requester follows the
 *    link emailed to the account's address (`confirmRecoveryEmail`).
 * 3. `completeAccountRecovery` — authorised by the token, and only once both
 *    of the above have happened. Swaps in the new keys and password, and wipes
 *    every other way into the account.
 *
 * Both halves are required because each alone is someone else's say-so: a
 * partner could file a request for your email and approve it themselves, and
 * someone who got into your inbox should not be able to replace your keys
 * either. See docs/account-recovery.md.
 */

/** How long a request stays open. Long enough for a partner to be reached. */
export const RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
/** Per email per hour. Low: a real person needs one, maybe a retry. */
export const MAX_REQUESTS_PER_EMAIL = 3;
/** Per address per hour. Higher, because people share addresses. */
export const MAX_REQUESTS_PER_IP = 10;

/** The token is random, so a plain digest is enough to make the column useless. */
async function tokenHash(token: string): Promise<string> {
	return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

export type StartRecoveryResult =
	| {
			ok: true;
			/** Goes back to the requester's page. The only part a caller may answer with. */
			token: string;
			/**
			 * What to email, and where: the link that proves the requester holds
			 * the account's address. NULL for an email with no account, which is
			 * sent nothing — so this must never reach the response.
			 */
			confirmation: { email: string; token: string } | null;
	  }
	| { ok: false; reason: 'rate-limited' };

/**
 * Opens a request. Behaves the same whether or not the account exists.
 *
 * That is the rule every line here is written around. Answering "no such
 * account", or "that account has no partner", would turn this unauthenticated
 * endpoint into a way to check whether someone uses the app — so an unknown
 * email still gets a row (with no user), still counts towards the rate limit,
 * and still gets a token back. It is simply never approved. The one thing that
 * differs, `confirmation`, goes to the account's own inbox, never to the
 * caller.
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
	const emailToken = account ? toBase64Url(crypto.getRandomValues(new Uint8Array(32))) : null;
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
			emailTokenHash: emailToken ? await tokenHash(emailToken) : null,
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

	return {
		ok: true,
		token,
		confirmation: emailToken ? { email: normaliseEmail(input.email), token: emailToken } : null
	};
}

/** Where a request stands, as the waiting requester's page is told it. */
export type RecoveryStatus = 'pending' | 'approved' | 'declined' | 'expired' | 'completed';

export type RecoveryProgress = {
	status: RecoveryStatus;
	/**
	 * Whether the emailed link has been confirmed. Separate from `status`
	 * because the two halves happen in either order, and the page shows both.
	 * Always false for an email with no account, like a link nobody opened.
	 */
	emailConfirmed: boolean;
};

async function findByToken(db: Db, token: string) {
	const [row] = await db
		.select({
			id: accountRecoveryRequests.id,
			userId: accountRecoveryRequests.userId,
			status: accountRecoveryRequests.status,
			expiresAt: accountRecoveryRequests.expiresAt,
			emailConfirmedAt: accountRecoveryRequests.emailConfirmedAt,
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
): Promise<RecoveryProgress> {
	const row = await findByToken(db, token);
	const emailConfirmed = Boolean(row?.emailConfirmedAt);
	return { status: await statusOf(db, row, now), emailConfirmed };
}

async function statusOf(
	db: Db,
	row: Awaited<ReturnType<typeof findByToken>>,
	now: Date
): Promise<RecoveryStatus> {
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

/**
 * The emailed half: marks a request's address as confirmed by the person who
 * opened the link sent to it.
 *
 * Only from a POST — the confirm page's button — never from loading the link,
 * because mail scanners fetch links to look at them, and one doing so must not
 * be able to vouch for anybody. Works while the request is open (pending, or
 * already approved by a partner), and is harmless to repeat. Anything else —
 * an unknown token, an expired, superseded, declined or finished request —
 * is the one answer, `invalid`.
 */
export async function confirmRecoveryEmail(
	db: Db,
	emailToken: string,
	now: Date = new Date()
): Promise<'confirmed' | 'invalid'> {
	const confirmed = await db
		.update(accountRecoveryRequests)
		.set({ emailConfirmedAt: now })
		.where(
			and(
				eq(accountRecoveryRequests.emailTokenHash, await tokenHash(emailToken)),
				inArray(accountRecoveryRequests.status, ['pending', 'approved']),
				gt(accountRecoveryRequests.expiresAt, now)
			)
		)
		.returning({ id: accountRecoveryRequests.id });
	return confirmed.length > 0 ? 'confirmed' : 'invalid';
}

export type CompleteRecoveryResult =
	| { ok: true; userId: string }
	| { ok: false; reason: 'not-approved' | 'email-unconfirmed' | 'expired' };

/**
 * Finishes a request a partner approved and the account's email confirmed: the
 * requester's new keys and password become the account's, and every other way
 * in is removed.
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
 *
 * And it marks the address verified: the emailed link just proved it, and an
 * account that somehow never confirmed could not otherwise sign in with the
 * new password.
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
	// The other half. Without it a partner's approval alone would be enough,
	// and a partner could file a request for your email and approve it.
	if (!row.emailConfirmedAt) {
		return { ok: false, reason: 'email-unconfirmed' };
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
		db.update(user).set({ emailVerified: true }).where(eq(user.id, userId)),
		db
			.update(accountRecoveryRequests)
			.set({ status: 'completed', resolvedAt: now })
			.where(eq(accountRecoveryRequests.id, row.id))
	]);

	return { ok: true, userId };
}
