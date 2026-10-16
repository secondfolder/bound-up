import { and, desc, eq, gt, isNotNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { CreateVaultInput, VaultWrapInput } from '../schemas/vault';
import type { VaultListingView, VaultWrapView } from '../types';
import { ESCROW_RELEASE_WINDOW_MS, ESCROW_SHARE_PURPOSE } from '../vault';
import type { Db } from './db';
import {
	accountRecoveryRequests,
	partnerships,
	userKeys,
	vaultEscrowRelays,
	vaultEscrows,
	vaults,
	vaultWraps
} from './db/schema';
import { keyedHash } from './keyed-hash';

/**
 * Every database access for vaults. See docs/encryption.md, "Vaults".
 *
 * Like `keys.ts`, this handles only opaque or public strings: a key check, a
 * recipient and age ciphertexts. What the server decides is who may write
 * what — a vault for a scope the caller belongs to, a wrap for a member of
 * that scope, made for the recipient that member really has. Whether a wrap
 * actually opens is something only the member's device can tell, and it does.
 */

const myWrap = alias(vaultWraps, 'my_wrap');
const partnerWrap = alias(vaultWraps, 'partner_wrap');
const inviterKeys = alias(userKeys, 'vault_inviter_keys');
const inviteeKeys = alias(userKeys, 'vault_invitee_keys');
const ownKeys = alias(userKeys, 'vault_own_keys');

function wrapOrNull(ciphertext: string | null, forRecipient: string | null): VaultWrapView | null {
	return ciphertext !== null && forRecipient !== null ? { ciphertext, forRecipient } : null;
}

/**
 * Every vault this user can reach, what they hold of each, and what is
 * missing. Three reads, run together; nothing here is per-partnership, so a
 * user with several partners costs the same.
 *
 * Null when the user has no keys at all, which every account has from signup,
 * so it is broken data rather than a state.
 */
export async function listVaultsForUser(db: Db, userId: string): Promise<VaultListingView | null> {
	const [keysRows, selfRows, partnershipRows] = await Promise.all([
		db
			.select({ recipient: userKeys.recipient })
			.from(userKeys)
			.where(eq(userKeys.userId, userId))
			.limit(1),
		db
			.select({
				id: vaults.id,
				keyCheck: vaults.keyCheck,
				wrapCiphertext: myWrap.ciphertext,
				wrapFor: myWrap.forRecipient
			})
			.from(vaults)
			.innerJoin(ownKeys, eq(ownKeys.userId, userId))
			// Only the wrap for the key this user has now. A member can hold a
			// second, for a key a partner-assisted sign-in is about to give them,
			// which nothing can open yet.
			.leftJoin(
				myWrap,
				and(
					eq(myWrap.vaultId, vaults.id),
					eq(myWrap.userId, userId),
					eq(myWrap.forRecipient, ownKeys.recipient)
				)
			)
			.where(eq(vaults.ownerUserId, userId))
			.limit(1),
		db
			.select({
				partnershipId: partnerships.id,
				inviterId: partnerships.inviterId,
				inviteeId: partnerships.inviteeId,
				inviterRecipient: inviterKeys.recipient,
				inviteeRecipient: inviteeKeys.recipient,
				vaultId: vaults.id,
				keyCheck: vaults.keyCheck,
				wrapCiphertext: myWrap.ciphertext,
				wrapFor: myWrap.forRecipient,
				partnerWrapFor: partnerWrap.forRecipient
			})
			.from(partnerships)
			.innerJoin(inviterKeys, eq(inviterKeys.userId, partnerships.inviterId))
			.innerJoin(inviteeKeys, eq(inviteeKeys.userId, partnerships.inviteeId))
			.leftJoin(vaults, eq(vaults.partnershipId, partnerships.id))
			// Each side's wrap only for the key that side has now; see above.
			.leftJoin(
				myWrap,
				and(
					eq(myWrap.vaultId, vaults.id),
					eq(myWrap.userId, userId),
					or(
						and(eq(partnerships.inviterId, userId), eq(myWrap.forRecipient, inviterKeys.recipient)),
						and(eq(partnerships.inviteeId, userId), eq(myWrap.forRecipient, inviteeKeys.recipient))
					)
				)
			)
			.leftJoin(
				partnerWrap,
				and(
					eq(partnerWrap.vaultId, vaults.id),
					// The partner is whichever member is not the viewer.
					or(
						and(
							eq(partnerships.inviterId, userId),
							eq(partnerWrap.userId, partnerships.inviteeId),
							eq(partnerWrap.forRecipient, inviteeKeys.recipient)
						),
						and(
							eq(partnerships.inviteeId, userId),
							eq(partnerWrap.userId, partnerships.inviterId),
							eq(partnerWrap.forRecipient, inviterKeys.recipient)
						)
					)
				)
			)
			.where(
				and(
					eq(partnerships.status, 'accepted'),
					or(eq(partnerships.inviterId, userId), eq(partnerships.inviteeId, userId))
				)
			)
			.orderBy(partnerships.createdAt, partnerships.id)
	]);

	const [keys] = keysRows;
	if (!keys) {
		return null;
	}
	const [self] = selfRows;
	const escrowRows = self
		? await db
				.select({ partnershipId: vaultEscrows.partnershipId })
				.from(vaultEscrows)
				.where(eq(vaultEscrows.vaultId, self.id))
		: [];

	return {
		recipient: keys.recipient,
		self: self
			? {
					id: self.id,
					kind: 'self',
					partnershipId: null,
					keyCheck: self.keyCheck,
					wrap: wrapOrNull(self.wrapCiphertext, self.wrapFor),
					escrowPartnershipIds: escrowRows.map((row) => row.partnershipId)
				}
			: null,
		partnerships: partnershipRows.map((row) => {
			// Which side is "mine" flips with who is looking — resolved here, as
			// `getRecipientsForPartnership` does, and nowhere else.
			const iAmInviter = row.inviterId === userId;
			return {
				partnershipId: row.partnershipId,
				partnerId: (iAmInviter ? row.inviteeId : row.inviterId) ?? '',
				recipients: iAmInviter
					? { mine: row.inviterRecipient, theirs: row.inviteeRecipient, vaultCheck: row.keyCheck }
					: { mine: row.inviteeRecipient, theirs: row.inviterRecipient, vaultCheck: row.keyCheck },
				vault:
					row.vaultId !== null && row.keyCheck !== null
						? {
								id: row.vaultId,
								kind: 'partnership',
								partnershipId: row.partnershipId,
								keyCheck: row.keyCheck,
								wrap: wrapOrNull(row.wrapCiphertext, row.wrapFor),
								partnerWrapFor: row.partnerWrapFor
							}
						: null
			};
		})
	};
}

/**
 * The members of a vault's scope and the recipient each has now, if `actorId`
 * is one of them. Null otherwise — the caller 404s, so a stranger cannot tell
 * a vault or partnership id is real.
 */
async function membersFor(
	db: Db,
	actorId: string,
	scope: { kind: 'self' } | { kind: 'partnership'; partnershipId: string }
): Promise<Map<string, string> | null> {
	if (scope.kind === 'self') {
		const [row] = await db
			.select({ recipient: userKeys.recipient })
			.from(userKeys)
			.where(eq(userKeys.userId, actorId))
			.limit(1);
		return row ? new Map([[actorId, row.recipient]]) : null;
	}

	const [row] = await db
		.select({
			inviterId: partnerships.inviterId,
			inviteeId: partnerships.inviteeId,
			inviterRecipient: inviterKeys.recipient,
			inviteeRecipient: inviteeKeys.recipient
		})
		.from(partnerships)
		.innerJoin(inviterKeys, eq(inviterKeys.userId, partnerships.inviterId))
		.innerJoin(inviteeKeys, eq(inviteeKeys.userId, partnerships.inviteeId))
		.where(and(eq(partnerships.id, scope.partnershipId), eq(partnerships.status, 'accepted')))
		.limit(1);
	if (!row?.inviteeId || (row.inviterId !== actorId && row.inviteeId !== actorId)) {
		return null;
	}
	return new Map([
		[row.inviterId, row.inviterRecipient],
		[row.inviteeId, row.inviteeRecipient]
	]);
}

/**
 * Whether every wrap is for a member, one each, made for the recipient that
 * member has now. A wrap for an old or a made-up recipient would be one the
 * member could never open, which is a vault silently lost to them.
 */
function wrapsCoverMembers(wraps: VaultWrapInput[], members: Map<string, string>): boolean {
	const seen = new Set<string>();
	for (const wrap of wraps) {
		if (seen.has(wrap.userId) || members.get(wrap.userId) !== wrap.forRecipient) {
			return false;
		}
		seen.add(wrap.userId);
	}
	return seen.size === members.size;
}

export type CreateVaultResult =
	| { ok: true }
	| { ok: false; reason: 'not-found' | 'invalid-wraps' | 'exists' };

/**
 * Creates a vault with a wrap for every member, in one batch.
 *
 * The vault and its wraps go in together because a vault nobody can open is
 * worse than none: every device would find it, fail to open it, and have no
 * way to make another, since the scope already has one.
 *
 * `exists` when the scope already has a vault — two devices racing to create
 * one, the ordinary way this happens. The unique columns refuse the second
 * insert; the batch's error is read by looking, not by parsing, because D1
 * and libsql word constraint errors differently.
 */
export async function createVault(
	db: Db,
	actorId: string,
	input: CreateVaultInput
): Promise<CreateVaultResult> {
	const scope =
		input.kind === 'self'
			? ({ kind: 'self' } as const)
			: ({ kind: 'partnership', partnershipId: input.partnershipId } as const);
	const members = await membersFor(db, actorId, scope);
	if (!members) {
		return { ok: false, reason: 'not-found' };
	}
	if (!wrapsCoverMembers(input.wraps, members)) {
		return { ok: false, reason: 'invalid-wraps' };
	}

	try {
		await db.batch([
			db.insert(vaults).values({
				id: input.id,
				kind: input.kind,
				ownerUserId: input.kind === 'self' ? actorId : null,
				partnershipId: input.kind === 'partnership' ? input.partnershipId : null,
				keyCheck: input.keyCheck
			}),
			db.insert(vaultWraps).values(
				input.wraps.map((wrap) => ({
					vaultId: input.id,
					userId: wrap.userId,
					ciphertext: wrap.ciphertext,
					forRecipient: wrap.forRecipient
				}))
			)
		]);
	} catch (error) {
		const [existing] = await db
			.select({ id: vaults.id })
			.from(vaults)
			.where(
				or(
					eq(vaults.id, input.id),
					input.kind === 'self'
						? eq(vaults.ownerUserId, actorId)
						: eq(vaults.partnershipId, input.partnershipId)
				)
			)
			.limit(1);
		if (existing) {
			return { ok: false, reason: 'exists' };
		}
		throw error;
	}
	return { ok: true };
}

export type PutVaultWrapResult =
	| { ok: true }
	| { ok: false; reason: 'not-found' | 'invalid-wrap' | 'current' };

/**
 * Stores a vault's key wrapped for one member: a member who has none for the
 * key they have now — none yet, or only ones for keys they no longer have,
 * after a partner-assisted sign-in elsewhere gave them a new one.
 *
 * `current` refuses to replace a wrap already made for the member's present
 * recipient. Such a wrap opens, and the only thing replacing it could do is
 * break it — a device bug, or a partner's, would otherwise be one request
 * from locking someone out of their own vault. A member may always replace
 * their own.
 */
export async function putVaultWrap(
	db: Db,
	actorId: string,
	vaultId: string,
	wrap: VaultWrapInput
): Promise<PutVaultWrapResult> {
	const [vault] = await db
		.select({
			kind: vaults.kind,
			partnershipId: vaults.partnershipId,
			ownerUserId: vaults.ownerUserId
		})
		.from(vaults)
		.where(eq(vaults.id, vaultId))
		.limit(1);
	if (!vault) {
		return { ok: false, reason: 'not-found' };
	}
	if (vault.kind === 'self' && vault.ownerUserId !== actorId) {
		return { ok: false, reason: 'not-found' };
	}
	const members = await membersFor(
		db,
		actorId,
		vault.kind === 'self'
			? { kind: 'self' }
			: { kind: 'partnership', partnershipId: vault.partnershipId ?? '' }
	);
	if (!members) {
		return { ok: false, reason: 'not-found' };
	}
	if (members.get(wrap.userId) !== wrap.forRecipient) {
		return { ok: false, reason: 'invalid-wrap' };
	}

	if (wrap.userId !== actorId) {
		const [existing] = await db
			.select({ id: vaultWraps.id })
			.from(vaultWraps)
			.where(
				and(
					eq(vaultWraps.vaultId, vaultId),
					eq(vaultWraps.userId, wrap.userId),
					eq(vaultWraps.forRecipient, wrap.forRecipient)
				)
			)
			.limit(1);
		if (existing) {
			return { ok: false, reason: 'current' };
		}
	}

	await db
		.insert(vaultWraps)
		.values({
			vaultId,
			userId: wrap.userId,
			ciphertext: wrap.ciphertext,
			forRecipient: wrap.forRecipient
		})
		.onConflictDoUpdate({
			target: [vaultWraps.vaultId, vaultWraps.userId, vaultWraps.forRecipient],
			set: { ciphertext: wrap.ciphertext, updatedAt: new Date() }
		});
	return { ok: true };
}

// ── escrow ───────────────────────────────────────────────────────────────────

/**
 * The server's half of an escrow: 32 bytes, as hex, derived from the escrow's
 * id under the auth secret. Stored nowhere, so the database alone never holds
 * it — and rotating `BETTER_AUTH_SECRET` invalidates every escrow, until each
 * user's next load makes new ones.
 */
export async function escrowShare(secret: string, escrowId: string): Promise<string> {
	return await keyedHash(secret, ESCROW_SHARE_PURPOSE, escrowId);
}

async function selfVaultId(db: Db, userId: string): Promise<string | null> {
	const [row] = await db
		.select({ id: vaults.id })
		.from(vaults)
		.where(eq(vaults.ownerUserId, userId))
		.limit(1);
	return row?.id ?? null;
}

/**
 * The share for an escrow the user is about to make.
 *
 * Only for an id no escrow has yet. The share of an *existing* escrow is what,
 * with the partner's half, opens the user's own vault — so outside a
 * partner-assisted sign-in it is never handed out, even to the account
 * itself: a stolen session plus a willing partner must not be enough.
 */
export async function issueEscrowShare(
	db: Db,
	secret: string,
	userId: string,
	escrowId: string
): Promise<string | null> {
	if (!(await selfVaultId(db, userId))) {
		return null;
	}
	const [taken] = await db
		.select({ id: vaultEscrows.id })
		.from(vaultEscrows)
		.where(eq(vaultEscrows.id, escrowId))
		.limit(1);
	return taken ? null : await escrowShare(secret, escrowId);
}

/**
 * Stores the user's own vault in escrow with one partner, replacing any
 * escrow already held with them. Only for an accepted partnership the user is
 * in, into their own vault.
 */
export async function putEscrow(
	db: Db,
	userId: string,
	input: { id: string; partnershipId: string; ciphertext: string }
): Promise<boolean> {
	const vaultId = await selfVaultId(db, userId);
	if (!vaultId) {
		return false;
	}
	const [partnership] = await db
		.select({ id: partnerships.id })
		.from(partnerships)
		.where(
			and(
				eq(partnerships.id, input.partnershipId),
				eq(partnerships.status, 'accepted'),
				or(eq(partnerships.inviterId, userId), eq(partnerships.inviteeId, userId))
			)
		)
		.limit(1);
	if (!partnership) {
		return false;
	}
	await db.batch([
		db
			.delete(vaultEscrows)
			.where(
				and(eq(vaultEscrows.vaultId, vaultId), eq(vaultEscrows.partnershipId, input.partnershipId))
			),
		db.insert(vaultEscrows).values({ ...input, vaultId })
	]);
	return true;
}

/**
 * Drops every escrow of the user's own vault. Called after the server has
 * released its share of them: a released share is no longer a secret, so the
 * escrows are made again, under new ids and so new shares.
 */
export async function deleteEscrows(db: Db, userId: string): Promise<void> {
	const vaultId = await selfVaultId(db, userId);
	if (vaultId) {
		await db.delete(vaultEscrows).where(eq(vaultEscrows.vaultId, vaultId));
	}
}

/** The completed, email-confirmed partner-assisted sign-in still inside the release window. */
async function releasableRecovery(db: Db, userId: string, now: Date) {
	const [row] = await db
		.select({ id: accountRecoveryRequests.id })
		.from(accountRecoveryRequests)
		.where(
			and(
				eq(accountRecoveryRequests.userId, userId),
				eq(accountRecoveryRequests.status, 'completed'),
				isNotNull(accountRecoveryRequests.emailConfirmedAt),
				gt(accountRecoveryRequests.resolvedAt, new Date(now.getTime() - ESCROW_RELEASE_WINDOW_MS))
			)
		)
		.orderBy(desc(accountRecoveryRequests.resolvedAt))
		.limit(1);
	return row ?? null;
}

export type EscrowRelease = {
	escrowId: string;
	vaultId: string;
	/** The partner's relay: the inner layer, age-encrypted to the account's new key. */
	ciphertext: string;
	share: string;
};

/**
 * Everything needed to open the user's own vault again after a
 * partner-assisted sign-in: each relay a partner passed on, and the server's
 * share for its escrow.
 *
 * Released only to the account itself, and only for relays belonging to a
 * sign-in that completed — which took a partner's approval *and* the link
 * emailed to the account's address — within `ESCROW_RELEASE_WINDOW_MS`. A
 * partner alone gets nothing here; neither does the server's own database.
 * Released as often as asked inside the window, so a device that failed
 * part-way can try again; the escrows are replaced once it succeeds.
 */
export async function releaseEscrow(
	db: Db,
	secret: string,
	userId: string,
	now: Date = new Date()
): Promise<EscrowRelease[]> {
	const recovery = await releasableRecovery(db, userId, now);
	const vaultId = await selfVaultId(db, userId);
	if (!(recovery && vaultId)) {
		return [];
	}
	const rows = await db
		.select({ escrowId: vaultEscrows.id, ciphertext: vaultEscrowRelays.ciphertext })
		.from(vaultEscrowRelays)
		.innerJoin(vaultEscrows, eq(vaultEscrows.id, vaultEscrowRelays.escrowId))
		.where(
			and(eq(vaultEscrows.vaultId, vaultId), eq(vaultEscrowRelays.recoveryRequestId, recovery.id))
		);
	return await Promise.all(
		rows.map(async (row) => ({ ...row, vaultId, share: await escrowShare(secret, row.escrowId) }))
	);
}

/**
 * Deletes the user's own vault, so a new one can be made — only once it can
 * never be opened again.
 *
 * That is: the account holds no wrap for the key it has now, and nothing could
 * still bring one back — it has no escrows at all (no partner held one), or the
 * window for releasing them has passed. Everything sealed in the old vault
 * goes with it; it was unreadable either way.
 */
export async function deleteLostSelfVault(
	db: Db,
	userId: string,
	now: Date = new Date()
): Promise<boolean> {
	const vaultId = await selfVaultId(db, userId);
	if (!vaultId) {
		return false;
	}
	const [keys] = await db
		.select({ recipient: userKeys.recipient })
		.from(userKeys)
		.where(eq(userKeys.userId, userId))
		.limit(1);
	const [usable] = await db
		.select({ id: vaultWraps.id })
		.from(vaultWraps)
		.where(
			and(
				eq(vaultWraps.vaultId, vaultId),
				eq(vaultWraps.userId, userId),
				eq(vaultWraps.forRecipient, keys?.recipient ?? '')
			)
		)
		.limit(1);
	if (usable) {
		return false;
	}
	const [escrow] = await db
		.select({ id: vaultEscrows.id })
		.from(vaultEscrows)
		.where(eq(vaultEscrows.vaultId, vaultId))
		.limit(1);
	if (escrow && (await releasableRecovery(db, userId, now))) {
		return false;
	}
	await db.delete(vaults).where(eq(vaults.id, vaultId));
	return true;
}

/**
 * The requester's escrow held in this partnership, for the partner helping
 * them back in — who opens their own layer of it and passes the inside on.
 */
export async function escrowForRequester(
	db: Db,
	input: { requesterId: string; partnershipId: string }
): Promise<{ id: string; ciphertext: string } | null> {
	const vaultId = await selfVaultId(db, input.requesterId);
	if (!vaultId) {
		return null;
	}
	const [row] = await db
		.select({ id: vaultEscrows.id, ciphertext: vaultEscrows.ciphertext })
		.from(vaultEscrows)
		.where(
			and(eq(vaultEscrows.vaultId, vaultId), eq(vaultEscrows.partnershipId, input.partnershipId))
		)
		.limit(1);
	return row ?? null;
}
