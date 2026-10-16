import { and, eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { CreateVaultInput, VaultWrapInput } from '../schemas/vault';
import type { VaultListingView, VaultWrapView } from '../types';
import type { Db } from './db';
import { partnerships, userKeys, vaults, vaultWraps } from './db/schema';

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

	return {
		recipient: keys.recipient,
		self: self
			? {
					id: self.id,
					kind: 'self',
					partnershipId: null,
					keyCheck: self.keyCheck,
					wrap: wrapOrNull(self.wrapCiphertext, self.wrapFor)
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
