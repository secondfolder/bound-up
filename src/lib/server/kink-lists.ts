import { and, eq, ne } from 'drizzle-orm';
import { assertNever } from '../assert-never';
import { kinkListKind, kinkListPartnerKind } from '../sealed-kinds/kink-list';
import type { KinkListView } from '../types';
import type { Db } from './db';
import { kinkLists } from './db/schema';
import {
	isPartnershipMember,
	partnershipVaultIdFor,
	type SealedWrite,
	sealedIsAcceptable,
	selfVaultIdFor
} from './sealed-content';

/**
 * Every database access for kink lists. See docs/kink-list.md.
 *
 * A list is one sealed record, so all the server checks is the envelope
 * (`sealedIsAcceptable`), that it is sealed under the vault its scope must
 * use, and who is asking. It never reads an answer.
 */

/** `'self'` for a person's own list; a partnership's id for the copy shared there. */
export type KinkListScope = 'self' | { partnershipId: string };

export type KinkListRefusal =
	| 'bad-content'
	| 'wrong-vault'
	| 'not-member'
	| 'conflict'
	| 'not-found';

export type KinkListResult<T = object> =
	| ({ ok: true } & T)
	| { ok: false; reason: KinkListRefusal };

function scopeKey(scope: KinkListScope): string {
	return scope === 'self' ? 'self' : scope.partnershipId;
}

const viewColumns = {
	id: kinkLists.id,
	scope: kinkLists.scope,
	revision: kinkLists.revision,
	editedAt: kinkLists.editedAt,
	ciphertext: kinkLists.ciphertext,
	vaultId: kinkLists.vaultId,
	payloadVersion: kinkLists.payloadVersion
} as const;

function toView(row: {
	id: string;
	scope: string;
	revision: number;
	editedAt: Date;
	ciphertext: string;
	vaultId: string;
	payloadVersion: number;
}): KinkListView {
	return {
		id: row.id,
		scope: row.scope,
		revision: row.revision,
		editedAt: row.editedAt,
		sealed: {
			recordId: row.id,
			vaultId: row.vaultId,
			ciphertext: row.ciphertext,
			payloadVersion: row.payloadVersion
		}
	};
}

/** The user's own list in a scope, or null before they have saved one. */
export async function getKinkList(
	db: Db,
	userId: string,
	scope: KinkListScope
): Promise<KinkListView | null> {
	const [row] = await db
		.select(viewColumns)
		.from(kinkLists)
		.where(and(eq(kinkLists.ownerId, userId), eq(kinkLists.scope, scopeKey(scope))))
		.limit(1);
	return row ? toView(row) : null;
}

/**
 * Which vault a scope's list must be sealed under, or why there is none for
 * this user. A partnership the user is not an accepted member of is
 * `not-member`, whatever the reason, so a stranger's id reads exactly like a
 * missing one.
 */
async function vaultFor(
	db: Db,
	userId: string,
	scope: KinkListScope
): Promise<{ vaultId: string | null } | { refusal: KinkListRefusal }> {
	if (scope === 'self') {
		return { vaultId: await selfVaultIdFor(db, userId) };
	}
	if (!(await isPartnershipMember(db, scope.partnershipId, userId))) {
		return { refusal: 'not-member' };
	}
	return { vaultId: await partnershipVaultIdFor(db, scope.partnershipId) };
}

/**
 * Saves a list: a new one when `expectedRevision` is null, otherwise an
 * edit, compare-and-swap on its revision. A lost race comes back as
 * `conflict`, and the browser fetches the latest, merges per kink and tries
 * again (`mergeLists`), so two devices editing at once both keep their
 * answers.
 */
export async function saveKinkList(
	db: Db,
	userId: string,
	input: {
		scope: KinkListScope;
		id: string;
		content: SealedWrite;
		expectedRevision: number | null;
		now?: Date;
	}
): Promise<KinkListResult<{ revision: number }>> {
	const { content, scope } = input;
	// Your own list and a partner's copy are different kinds, with different payloads.
	const kind = scope === 'self' ? kinkListKind : kinkListPartnerKind;
	if (!sealedIsAcceptable(kind, content.ciphertext, content.payloadVersion)) {
		return { ok: false, reason: 'bad-content' };
	}
	const vault = await vaultFor(db, userId, scope);
	if ('refusal' in vault) {
		return { ok: false, reason: vault.refusal };
	}
	if (vault.vaultId === null || content.vaultId !== vault.vaultId) {
		return { ok: false, reason: 'wrong-vault' };
	}
	const now = input.now ?? new Date();
	if (input.expectedRevision === null) {
		const inserted = await db
			.insert(kinkLists)
			.values({
				id: input.id,
				ownerId: userId,
				scope: scopeKey(scope),
				partnershipId: scope === 'self' ? null : scope.partnershipId,
				ciphertext: content.ciphertext,
				vaultId: content.vaultId,
				payloadVersion: content.payloadVersion,
				editedAt: now
			})
			// Either the id or (owner, scope) already exists: another device
			// made this list first, and the browser merges into that one.
			.onConflictDoNothing()
			.returning({ revision: kinkLists.revision });
		const [row] = inserted;
		return row ? { ok: true, revision: row.revision } : { ok: false, reason: 'conflict' };
	}
	const updated = await db
		.update(kinkLists)
		.set({
			ciphertext: content.ciphertext,
			vaultId: content.vaultId,
			payloadVersion: content.payloadVersion,
			revision: input.expectedRevision + 1,
			editedAt: now,
			updatedAt: now
		})
		.where(
			and(
				eq(kinkLists.id, input.id),
				eq(kinkLists.ownerId, userId),
				eq(kinkLists.scope, scopeKey(scope)),
				eq(kinkLists.revision, input.expectedRevision)
			)
		)
		.returning({ revision: kinkLists.revision });
	const [row] = updated;
	if (row) {
		return { ok: true, revision: row.revision };
	}
	return { ok: false, reason: (await getKinkList(db, userId, scope)) ? 'conflict' : 'not-found' };
}

/** Every partnership the user shares their list with, as their own copies there. */
export async function listSharedKinkLists(db: Db, userId: string): Promise<KinkListView[]> {
	const rows = await db
		.select(viewColumns)
		.from(kinkLists)
		.where(and(eq(kinkLists.ownerId, userId), ne(kinkLists.scope, 'self')));
	return rows.map(toView);
}

/**
 * The copy the other member of a partnership shares with the user, or null
 * while they share none. `not-member` for a partnership the user is not an
 * accepted member of, so a stranger's id reads like a missing one.
 */
export async function getPartnerKinkList(
	db: Db,
	userId: string,
	partnershipId: string
): Promise<KinkListResult<{ list: KinkListView | null }>> {
	if (!(await isPartnershipMember(db, partnershipId, userId))) {
		return { ok: false, reason: 'not-member' };
	}
	const [row] = await db
		.select(viewColumns)
		.from(kinkLists)
		.where(and(eq(kinkLists.partnershipId, partnershipId), ne(kinkLists.ownerId, userId)))
		.limit(1);
	return { ok: true, list: row ? toView(row) : null };
}

/** A refusal as a status and words a person can act on. */
export function describeKinkListRefusal(reason: KinkListRefusal): {
	status: number;
	message: string;
} {
	switch (reason) {
		case 'conflict':
			return {
				status: 409,
				message: 'Your list changed somewhere else. Merging and trying again.'
			};
		case 'not-found':
			return { status: 404, message: 'That list is not there any more. Reload and try again.' };
		case 'not-member':
			return { status: 404, message: 'That partnership is not there any more.' };
		case 'wrong-vault':
			return {
				status: 409,
				message: 'Something changed since this page loaded. Reload and try again.'
			};
		case 'bad-content':
			return { status: 400, message: 'That could not be saved. Reload and try again.' };
		default:
			return assertNever(reason, 'kink list refusal');
	}
}
