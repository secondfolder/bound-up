import { and, desc, eq, lt, ne, sql } from 'drizzle-orm';
import { assertNever } from '../assert-never';
import { kinkListKind, kinkListPartnerKind } from '../sealed-kinds/kink-list';
import type { KinkListView } from '../types';
import type { Db } from './db';
import { kinkLists, kinkListVersions } from './db/schema';
import {
	isPartnershipMember,
	partnershipVaultIdFor,
	type SealedWrite,
	sealedIsAcceptable,
	selfVaultIdFor
} from './sealed-content';
import { soloSpaceIdOf } from './spaces';

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
		/** Freeze what this replaces as a version whatever its age (`startOver`). Own list only. */
		keepVersion?: boolean;
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
				// A partnership's space has the partnership's id.
				spaceId: scope === 'self' ? soloSpaceIdOf(userId) : scope.partnershipId,
				ciphertext: content.ciphertext,
				vaultId: content.vaultId,
				payloadVersion: content.payloadVersion,
				editedAt: now,
				// The first version's history starts here, so it follows an injected `now` too.
				createdAt: now,
				updatedAt: now
			})
			// Either the id or (owner, scope) already exists: another device
			// made this list first, and the browser merges into that one.
			.onConflictDoNothing()
			.returning({ revision: kinkLists.revision });
		const [row] = inserted;
		return row ? { ok: true, revision: row.revision } : { ok: false, reason: 'conflict' };
	}
	const matchesExpected = and(
		eq(kinkLists.id, input.id),
		eq(kinkLists.ownerId, userId),
		eq(kinkLists.scope, scopeKey(scope)),
		eq(kinkLists.revision, input.expectedRevision)
	);
	const update = db
		.update(kinkLists)
		.set({
			ciphertext: content.ciphertext,
			vaultId: content.vaultId,
			payloadVersion: content.payloadVersion,
			revision: input.expectedRevision + 1,
			editedAt: now,
			updatedAt: now
		})
		.where(matchesExpected)
		.returning({ revision: kinkLists.revision });
	// Only your own list keeps a history: a partner's copy follows it.
	const [, updated] =
		scope === 'self'
			? await db.batch([freezeVersion(db, matchesExpected, now, input.keepVersion), update])
			: [null, await update];
	const [row] = updated;
	if (row) {
		if (input.keepVersion) {
			// The server cannot read a list, so it cannot say why it would not
			// open; the browser logs that. This is the server's half: that one
			// was replaced, kept, and whose, to find it in the versions again.
			console.warn('[kink-list] Replaced a list its owner could not open; kept as a version', {
				userId,
				listId: input.id,
				revision: row.revision
			});
		}
		return { ok: true, revision: row.revision };
	}
	return { ok: false, reason: (await getKinkList(db, userId, scope)) ? 'conflict' : 'not-found' };
}

/** How long a list has to sit unchanged before the next save keeps what it was as a version. */
export const VERSION_QUIET_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Copies the list as it stands into `kink_list_versions`, if it has not been
 * edited for a week. It is an `INSERT … SELECT` conditioned on the same
 * revision as the save it is batched with, rather than a read and then a
 * write, so a save that loses the compare-and-swap freezes nothing: two
 * devices racing after a quiet week leave one version, not two. And it needs
 * no cron: a list nobody edits has nothing new to keep.
 */
function freezeVersion(db: Db, matchesExpected: ReturnType<typeof and>, now: Date, always = false) {
	const cutoff = new Date(now.getTime() - VERSION_QUIET_DAYS * DAY_MS);
	return db.insert(kinkListVersions).select(
		db
			.select({
				// Generated here: an `INSERT … SELECT` skips the column's own default.
				id: sql<string>`${crypto.randomUUID()}`.as('id'),
				listId: kinkLists.id,
				vaultId: kinkLists.vaultId,
				ciphertext: kinkLists.ciphertext,
				payloadVersion: kinkLists.payloadVersion,
				// The burst began where the previous version ended, or when the list was made.
				editedFrom:
					sql<Date>`coalesce((select max(${kinkListVersions.editedTo}) from ${kinkListVersions} where ${kinkListVersions.listId} = ${kinkLists.id}), ${kinkLists.createdAt})`.as(
						'edited_from'
					),
				editedTo: kinkLists.editedAt,
				frozenAt: sql<Date>`${now.getTime()}`.as('frozen_at')
			})
			.from(kinkLists)
			// `always`: the list being replaced is one its owner could not open,
			// and is kept however recently it changed (`keepVersion`).
			.where(and(matchesExpected, always ? undefined : lt(kinkLists.editedAt, cutoff)))
	);
}

/** A version of your own list, oldest first in `listKinkListVersions`. */
export type KinkListVersionView = {
	id: string;
	editedFrom: Date;
	editedTo: Date;
	sealed: KinkListView['sealed'];
};

/**
 * Whether the user's own list has any version kept: what decides whether the
 * list offers its history at all. One row at most, of one column.
 */
export async function hasKinkListVersions(db: Db, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: kinkListVersions.id })
		.from(kinkListVersions)
		.innerJoin(kinkLists, eq(kinkLists.id, kinkListVersions.listId))
		.where(and(eq(kinkLists.ownerId, userId), eq(kinkLists.scope, 'self')))
		.limit(1);
	return row !== undefined;
}

/** Every version kept of the user's own list, oldest first. Empty before a week has gone by. */
export async function listKinkListVersions(db: Db, userId: string): Promise<KinkListVersionView[]> {
	const rows = await db
		.select({
			id: kinkListVersions.id,
			listId: kinkListVersions.listId,
			editedFrom: kinkListVersions.editedFrom,
			editedTo: kinkListVersions.editedTo,
			ciphertext: kinkListVersions.ciphertext,
			vaultId: kinkListVersions.vaultId,
			payloadVersion: kinkListVersions.payloadVersion
		})
		.from(kinkListVersions)
		.innerJoin(kinkLists, eq(kinkLists.id, kinkListVersions.listId))
		.where(and(eq(kinkLists.ownerId, userId), eq(kinkLists.scope, 'self')))
		.orderBy(kinkListVersions.editedTo, desc(kinkListVersions.frozenAt));
	return rows.map((row) => ({
		id: row.id,
		editedFrom: row.editedFrom,
		editedTo: row.editedTo,
		// Sealed to the list's id: a version is the list as it was, sealed then.
		sealed: {
			recordId: row.listId,
			vaultId: row.vaultId,
			ciphertext: row.ciphertext,
			payloadVersion: row.payloadVersion
		}
	}));
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
