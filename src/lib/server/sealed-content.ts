import { and, eq } from 'drizzle-orm';
import { isKnownVersion, type SealedKind, sealedPatternFor } from '../sealed';
import type { SealedRefView } from '../types';
import type { Db } from './db';
import { partnerships, vaults } from './db/schema';
import { type ItemSpace, isSpaceMember } from './spaces';

/**
 * What the server does with a sealed record, shared by every kind that has
 * one: check its envelope, find the vault it must be sealed under, and hand it
 * back as a reference a device can open. It never reads the content.
 */

/** A sealed record as a write carries it. */
export type SealedWrite = { vaultId: string; ciphertext: string; payloadVersion: number };

/**
 * Whether a sealed ciphertext is one the server will store for `kind`: the
 * format, the kind's cap, and a version this build knows. The content is the
 * one thing it cannot check, and does not try to.
 */
export function sealedIsAcceptable(
	kind: SealedKind<unknown>,
	ciphertext: string,
	version: number
): boolean {
	return (
		ciphertext.length > 0 &&
		ciphertext.length <= kind.maxCiphertextLength &&
		sealedPatternFor(kind).test(ciphertext) &&
		isKnownVersion(kind, version)
	);
}

/** The user's own vault, or null while they have none — a device makes it on its next load. */
export async function selfVaultIdFor(db: Db, userId: string): Promise<string | null> {
	const [row] = await db
		.select({ id: vaults.id })
		.from(vaults)
		.where(eq(vaults.ownerUserId, userId))
		.limit(1);
	return row?.id ?? null;
}

/** The partnership's vault, or null while it has none. */
export async function partnershipVaultIdFor(db: Db, partnershipId: string): Promise<string | null> {
	const [row] = await db
		.select({ id: vaults.id })
		.from(vaults)
		.where(eq(vaults.partnershipId, partnershipId))
		.limit(1);
	return row?.id ?? null;
}

/**
 * The vault a space's content is sealed under, or null while it has none:
 * its member's own vault for a solo space, the partnership's for a shared one.
 * Looked up by the vault's own scope columns, which every vault has had from
 * the start, rather than its later `space_id`.
 */
export async function vaultIdForSpace(
	db: Db,
	space: Pick<ItemSpace, 'id' | 'kind' | 'members'>
): Promise<string | null> {
	if (space.kind === 'shared') {
		return await partnershipVaultIdFor(db, space.id);
	}
	const [owner] = space.members;
	return owner ? await selfVaultIdFor(db, owner.userId) : null;
}

/** Whether `userId` is in this accepted partnership. */
export async function isPartnershipMember(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<boolean> {
	const [row] = await db
		.select({ id: partnerships.id })
		.from(partnerships)
		.where(
			and(
				eq(partnerships.id, partnershipId),
				eq(partnerships.status, 'accepted'),
				isSpaceMember(partnerships.id, userId)
			)
		)
		.limit(1);
	return Boolean(row);
}

/** A row's own sealed content, as a reference, or null while it is still plaintext. */
export function sealedRef(
	recordId: string,
	row: { ciphertext: string | null; vaultId: string | null; payloadVersion: number | null }
): SealedRefView | null {
	return row.ciphertext !== null && row.vaultId !== null && row.payloadVersion !== null
		? {
				recordId,
				vaultId: row.vaultId,
				ciphertext: row.ciphertext,
				payloadVersion: row.payloadVersion
			}
		: null;
}

/** A completion's or claim's sealed snapshot, as a reference, or null for a plaintext one. */
export function snapshotRef(row: {
	snapshotCiphertext: string | null;
	snapshotVaultId: string | null;
	snapshotVersion: number | null;
	snapshotRecordId: string | null;
}): SealedRefView | null {
	return row.snapshotCiphertext !== null &&
		row.snapshotVaultId !== null &&
		row.snapshotVersion !== null &&
		row.snapshotRecordId !== null
		? {
				recordId: row.snapshotRecordId,
				vaultId: row.snapshotVaultId,
				ciphertext: row.snapshotCiphertext,
				payloadVersion: row.snapshotVersion
			}
		: null;
}
