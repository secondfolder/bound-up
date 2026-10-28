import { and, desc, eq, gt, inArray, lt, lte, max, or, sql } from 'drizzle-orm';
import {
	canMoveEntry,
	canSetAccess,
	compactionBound,
	type EntryAccess,
	type EntryForAccess,
	entryAccessFor,
	type NotebookKind,
	type PartnerAccess,
	type SpaceForAccess
} from '../notebook';
import {
	notebookEntryKind,
	notebookSnapshotKind,
	notebookUpdateKind
} from '../sealed-kinds/notebook';
import type { NotebookEntryView, NotebookVersionView, WidgetItemView } from '../types';
import type { Db } from './db';
import { notebookEntries, notebookUpdates, notebookVersions } from './db/schema';
import { type MediaStore, notebookEntryPrefix, notebookSnapshotKey } from './media';
import { type RoomKey, spaceRoom } from './realtime/index';
import {
	partnershipVaultIdFor,
	type SealedWrite,
	sealedIsAcceptable,
	sealedRef,
	selfVaultIdFor
} from './sealed-content';
import { loadItemSpace, soloSpaceFor, soloSpaceIdOf } from './spaces';

/**
 * Every database access for the notebook. See docs/notebook.md.
 *
 * Everything an entry says is sealed in the browser, so all the server checks
 * is each record's envelope (`sealedIsAcceptable`), that it is sealed under
 * the vault the entry's scope must use, and who is asking: `entryAccessFor`,
 * re-read from the database on every call rather than trusted from a form
 * (AGENTS.md invariant 14). It never reads a word of an entry.
 */

/** Whose notebook: one account's own, or a partnership's shared one. */
export type NotebookScope = { kind: 'self' } | { kind: 'partnership'; partnershipId: string };

/** The notebook scope a space is: your own solo space, or a partnership's. */
export function scopeForSpace(space: { spaceId: string; kind: 'solo' | 'shared' }): NotebookScope {
	return space.kind === 'solo'
		? { kind: 'self' }
		: { kind: 'partnership', partnershipId: space.spaceId };
}

/** What a viewer may do in a scope, once it is known they are in it. */
export type ResolvedScope = {
	scope: NotebookScope;
	/** The scope's space: the viewer's solo space, or the partnership's (the same id). */
	spaceId: string;
	/** The vault every record in this scope must be sealed under, or null while there is none yet. */
	vaultId: string | null;
	/** A partnership's space and who manages it; null for the viewer's own. */
	partnership: SpaceForAccess | null;
	/** The space's realtime room: its list's stream, and its entries'. */
	room: RoomKey;
};

/**
 * An accepted partnership's space, with its members and which of them manage
 * it, if `userId` is one of them. The rules follow `can_manage`, never the
 * partnership's `control` column, which is only the invite's offer.
 */
async function sharedSpaceForAccess(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<SpaceForAccess | null> {
	const space = await loadItemSpace(db, userId, partnershipId);
	return space?.kind === 'shared' ? { members: space.members } : null;
}

/**
 * The scope, if `userId` may use it, or null. A partnership the viewer is not
 * an accepted member of is null, so a route can answer it with the same 404
 * as one that does not exist.
 */
export async function resolveScope(
	db: Db,
	scope: NotebookScope,
	userId: string
): Promise<ResolvedScope | null> {
	if (scope.kind === 'self') {
		const [spaceId, vaultId] = await Promise.all([
			soloSpaceFor(db, userId),
			selfVaultIdFor(db, userId)
		]);
		if (!spaceId) {
			return null;
		}
		return {
			scope,
			spaceId,
			vaultId,
			partnership: null,
			room: spaceRoom(spaceId)
		};
	}
	const partnership = await sharedSpaceForAccess(db, scope.partnershipId, userId);
	if (!partnership) {
		return null;
	}
	return {
		scope,
		spaceId: scope.partnershipId,
		vaultId: await partnershipVaultIdFor(db, scope.partnershipId),
		partnership,
		room: spaceRoom(scope.partnershipId)
	};
}

const entryColumns = {
	id: notebookEntries.id,
	ownerId: notebookEntries.ownerId,
	partnershipId: notebookEntries.partnershipId,
	spaceId: notebookEntries.spaceId,
	kind: notebookEntries.kind,
	entryDate: notebookEntries.entryDate,
	createdByUserId: notebookEntries.createdByUserId,
	partnerAccess: notebookEntries.partnerAccess,
	accessSetByUserId: notebookEntries.accessSetByUserId,
	lastEditedAt: notebookEntries.lastEditedAt,
	lastEditedByUserId: notebookEntries.lastEditedByUserId,
	ciphertext: notebookEntries.ciphertext,
	vaultId: notebookEntries.vaultId,
	payloadVersion: notebookEntries.payloadVersion,
	revision: notebookEntries.revision,
	createdAt: notebookEntries.createdAt
};

type EntryRow = {
	id: string;
	ownerId: string | null;
	partnershipId: string | null;
	spaceId: string | null;
	kind: NotebookKind;
	entryDate: string | null;
	createdByUserId: string | null;
	partnerAccess: PartnerAccess;
	accessSetByUserId: string | null;
	lastEditedAt: Date;
	lastEditedByUserId: string | null;
	ciphertext: string;
	vaultId: string;
	payloadVersion: number;
	revision: number;
	createdAt: Date;
};

function forAccess(
	row: Pick<
		EntryRow,
		'partnershipId' | 'ownerId' | 'partnerAccess' | 'accessSetByUserId' | 'createdByUserId'
	>
): EntryForAccess {
	return row.partnershipId
		? {
				scope: 'partnership',
				partnerAccess: row.partnerAccess,
				accessSetByUserId: row.accessSetByUserId,
				createdByUserId: row.createdByUserId
			}
		: { scope: 'self', ownerId: row.ownerId ?? '' };
}

/** One entry as a viewer may use it. */
export type EntryContext = {
	entry: EntryRow;
	access: EntryAccess;
	/** Whether the viewer may change who else can see or edit it. Always false for a solo entry. */
	canSetAccess: boolean;
	/** The partnership's space a shared entry is in; null for a solo entry. */
	partnership: SpaceForAccess | null;
	/** Its space's room, where its edits and cursors are relayed. */
	room: RoomKey;
};

/**
 * One entry and what `userId` may do with it, or null when they may do
 * nothing, which covers an entry that does not exist, one in somebody else's
 * notebook, and one hidden from them, alike. Every route answers null with
 * the same 404, so the three cannot be told apart.
 *
 * `scope`, when given, must match: a caller that already knows the scope may
 * not reach an entry of another partnership, or a solo one, by its id.
 */
export async function getEntryContext(
	db: Db,
	entryId: string,
	userId: string,
	scope?: NotebookScope
): Promise<EntryContext | null> {
	const [row] = await db
		.select(entryColumns)
		.from(notebookEntries)
		.where(eq(notebookEntries.id, entryId))
		.limit(1);
	if (!row) {
		return null;
	}
	if (scope) {
		const matches =
			scope.kind === 'self' ? row.ownerId !== null : row.partnershipId === scope.partnershipId;
		if (!matches) {
			return null;
		}
	}
	const partnership = row.partnershipId
		? await sharedSpaceForAccess(db, row.partnershipId, userId)
		: null;
	const access = entryAccessFor(forAccess(row), userId, partnership ?? undefined);
	if (access === 'none') {
		return null;
	}
	return {
		entry: row,
		access,
		canSetAccess:
			partnership !== null &&
			canSetAccess(
				{
					scope: 'partnership',
					partnerAccess: row.partnerAccess,
					accessSetByUserId: row.accessSetByUserId,
					createdByUserId: row.createdByUserId
				},
				userId,
				partnership
			),
		partnership,
		room: spaceRoom(entrySpaceId(row))
	};
}

/**
 * The space an entry is in. Every row has `space_id` since the spaces
 * backfill; a shared entry's is its partnership's id in any case.
 */
export function entrySpaceId(row: Pick<EntryRow, 'spaceId' | 'partnershipId'>): string {
	return row.spaceId ?? row.partnershipId ?? '';
}

function toListEntry(row: EntryRow, access: EntryAccess, visible: boolean): NotebookEntryView {
	return {
		spaceId: entrySpaceId(row),
		id: row.id,
		kind: row.kind,
		entryDate: row.entryDate,
		lastEditedAt: row.lastEditedAt.toISOString(),
		lastEditedByUserId: row.lastEditedByUserId,
		createdByUserId: row.createdByUserId,
		access,
		partnerAccess: row.partnerAccess,
		header: visible ? sealedRef(row.id, row) : null
	};
}

/**
 * Every entry of one kind in the given scopes that `userId` may see, in the
 * order its list shows them: a journal by date, newest first; notes by when
 * they were last edited. Several scopes are the Everyone list: one query over
 * every space in it (`space_id IN (…)`), each row's access then worked out
 * against its own scope, exactly as a list of that scope alone would.
 *
 * An entry hidden from the viewer is left out, except where the viewer may
 * now lift that restriction (control has moved to them since it was set): it
 * is listed with no header, so the page can offer to show it again without
 * telling them what it says.
 */
export async function listEntries(
	db: Db,
	scopes: ResolvedScope | readonly ResolvedScope[],
	userId: string,
	kind: NotebookKind
): Promise<NotebookEntryView[]> {
	const list: readonly ResolvedScope[] = 'scope' in scopes ? [scopes] : scopes;
	const bySpace = new Map(list.map((resolved) => [resolved.spaceId, resolved]));
	if (bySpace.size === 0) {
		return [];
	}
	const where = and(
		inArray(notebookEntries.spaceId, [...bySpace.keys()]),
		eq(notebookEntries.kind, kind)
	);
	const order =
		kind === 'journal'
			? [desc(notebookEntries.entryDate), desc(notebookEntries.createdAt), notebookEntries.id]
			: [desc(notebookEntries.lastEditedAt), notebookEntries.id];
	const rows = await db
		.select(entryColumns)
		.from(notebookEntries)
		.where(where)
		.orderBy(...order);
	return rows.flatMap((row) => {
		const resolved = bySpace.get(entrySpaceId(row));
		if (!resolved) {
			return [];
		}
		const access = entryAccessFor(forAccess(row), userId, resolved.partnership ?? undefined);
		if (access !== 'none') {
			return [toListEntry(row, access, true)];
		}
		const liftable =
			resolved.partnership !== null &&
			canSetAccess(
				{
					scope: 'partnership',
					partnerAccess: row.partnerAccess,
					accessSetByUserId: row.accessSetByUserId,
					createdByUserId: row.createdByUserId
				},
				userId,
				resolved.partnership
			);
		return liftable ? [toListEntry(row, access, false)] : [];
	});
}

/** The few most recently edited entries, for Today's notebook cards. */
export async function listRecentEntries(
	db: Db,
	resolved: ResolvedScope,
	userId: string,
	limit = 3
): Promise<NotebookEntryView[]> {
	const where =
		resolved.scope.kind === 'self'
			? eq(notebookEntries.ownerId, userId)
			: eq(notebookEntries.partnershipId, resolved.scope.partnershipId);
	// Hidden entries are filtered after the query, so ask for enough that a few
	// of them cannot leave the card short.
	const rows = await db
		.select(entryColumns)
		.from(notebookEntries)
		.where(where)
		.orderBy(desc(notebookEntries.lastEditedAt), notebookEntries.id)
		.limit(limit * 4);
	return rows
		.flatMap((row) => {
			const access = entryAccessFor(forAccess(row), userId, resolved.partnership ?? undefined);
			return access === 'none' ? [] : [toListEntry(row, access, true)];
		})
		.slice(0, limit);
}

/** Rows a notebook card previews. */
const WIDGET_PREVIEW_LIMIT = 3;

function widgetItems(entries: NotebookEntryView[]): WidgetItemView[] {
	return entries.map((entry) => ({
		id: entry.id,
		// Sealed: `WidgetItems` opens the title from the header.
		title: '',
		kind: 'notebook',
		sealed: entry.header,
		note: entry.kind === 'journal' ? entry.entryDate : null,
		context: null
	}));
}

/**
 * Today's card in Everyone and Me: the solo notebook's most recently edited entries. A cheap
 * read of its own rather than the list page's, because D1 bills rows read.
 */
export async function getHomeNotebookWidget(db: Db, userId: string): Promise<WidgetItemView[]> {
	const resolved = await resolveScope(db, { kind: 'self' }, userId);
	return resolved
		? widgetItems(await listRecentEntries(db, resolved, userId, WIDGET_PREVIEW_LIMIT))
		: [];
}

/**
 * Today's card in a partnership's context: the shared notebook's most recently edited entries,
 * leaving out any hidden from the viewer. Null for a non-member.
 */
export async function getPartnershipNotebookWidget(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<WidgetItemView[] | null> {
	const resolved = await resolveScope(db, { kind: 'partnership', partnershipId }, userId);
	return resolved
		? widgetItems(await listRecentEntries(db, resolved, userId, WIDGET_PREVIEW_LIMIT))
		: null;
}

export type NotebookRefusal =
	| 'bad-content'
	| 'wrong-vault'
	| 'read-only'
	| 'exists'
	| 'conflict'
	| 'stale'
	| 'same-space'
	| 'not-found';

export type NotebookResult<T = object> =
	| ({ ok: true } & T)
	| { ok: false; reason: NotebookRefusal };

/** A sealed edit as a write carries it: the record's own id, plus the envelope. */
export type SealedUpdateWrite = SealedWrite & { id: string };

function vaultMatches(resolved: { vaultId: string | null }, vaultId: string): boolean {
	return resolved.vaultId !== null && resolved.vaultId === vaultId;
}

/**
 * Creates an entry together with its first edit.
 *
 * The first edit is what gives the document its root paragraph and empty
 * title. Writing it here, in the same batch, is what stops two devices ever
 * racing to bootstrap the same empty document: nobody opens an entry before
 * it has one. See docs/notebook.md, "Bootstrapping".
 */
export async function createEntry(
	db: Db,
	resolved: ResolvedScope,
	userId: string,
	input: {
		id: string;
		kind: NotebookKind;
		entryDate: string | null;
		header: SealedWrite;
		firstUpdate: SealedUpdateWrite;
	}
): Promise<NotebookResult<{ seq: number }>> {
	const { header, firstUpdate } = input;
	if (
		!(
			sealedIsAcceptable(notebookEntryKind, header.ciphertext, header.payloadVersion) &&
			sealedIsAcceptable(notebookUpdateKind, firstUpdate.ciphertext, firstUpdate.payloadVersion)
		)
	) {
		return { ok: false, reason: 'bad-content' };
	}
	if (!(vaultMatches(resolved, header.vaultId) && vaultMatches(resolved, firstUpdate.vaultId))) {
		return { ok: false, reason: 'wrong-vault' };
	}
	const [existing] = await db
		.select({ id: notebookEntries.id })
		.from(notebookEntries)
		.where(eq(notebookEntries.id, input.id))
		.limit(1);
	if (existing) {
		return { ok: false, reason: 'exists' };
	}
	const now = new Date();
	const [, inserted] = await db.batch([
		db.insert(notebookEntries).values({
			id: input.id,
			ownerId: resolved.scope.kind === 'self' ? userId : null,
			partnershipId: resolved.scope.kind === 'partnership' ? resolved.scope.partnershipId : null,
			spaceId:
				resolved.scope.kind === 'partnership'
					? resolved.scope.partnershipId
					: soloSpaceIdOf(userId),
			kind: input.kind,
			entryDate: input.kind === 'journal' ? input.entryDate : null,
			createdByUserId: userId,
			lastEditedAt: now,
			lastEditedByUserId: userId,
			ciphertext: header.ciphertext,
			vaultId: header.vaultId,
			payloadVersion: header.payloadVersion
		}),
		db
			.insert(notebookUpdates)
			.values({
				id: firstUpdate.id,
				entryId: input.id,
				authorUserId: userId,
				vaultId: firstUpdate.vaultId,
				payloadVersion: firstUpdate.payloadVersion,
				ciphertext: firstUpdate.ciphertext
			})
			.returning({ seq: notebookUpdates.seq })
	]);
	const seq = inserted[0]?.seq;
	if (seq === undefined) {
		throw new Error('Inserting a notebook entry’s first edit returned no seq');
	}
	return { ok: true, seq };
}

/**
 * How long `last_edited_at` may lag. Every batch of typing is a request, and
 * D1 bills rows written, so the entry row is touched at most this often; a
 * list sorted by it is never more than a minute out.
 */
const LAST_EDITED_RESOLUTION_MS = 60_000;

/**
 * Stores one batch of edits, and returns the `seq` it was given.
 *
 * Idempotent on the batch's id: a device that resends after a lost response
 * is told the seq the first copy got, rather than storing it twice. (Storing
 * it twice would be harmless to the document, since Yjs ignores an update it
 * already has, but would waste a row.)
 */
export async function appendUpdate(
	db: Db,
	context: EntryContext,
	userId: string,
	update: SealedUpdateWrite
): Promise<NotebookResult<{ seq: number; duplicate: boolean }>> {
	if (context.access !== 'edit') {
		return { ok: false, reason: 'read-only' };
	}
	if (!sealedIsAcceptable(notebookUpdateKind, update.ciphertext, update.payloadVersion)) {
		return { ok: false, reason: 'bad-content' };
	}
	if (update.vaultId !== context.entry.vaultId) {
		return { ok: false, reason: 'wrong-vault' };
	}
	const [already] = await db
		.select({ seq: notebookUpdates.seq, entryId: notebookUpdates.entryId })
		.from(notebookUpdates)
		.where(eq(notebookUpdates.id, update.id))
		.limit(1);
	if (already) {
		// The same id under another entry is not a resend: it is a client
		// reusing an id, which the seal (bound to the id) would make unreadable
		// anyway. Refused rather than silently aliased.
		return already.entryId === context.entry.id
			? { ok: true, seq: already.seq, duplicate: true }
			: { ok: false, reason: 'exists' };
	}
	const now = new Date();
	const [inserted] = await db.batch([
		// An `INSERT … SELECT` conditioned on the entry still being sealed under
		// this vault, rather than trusting the read above: an entry moved to
		// another space between that read and this write would otherwise get
		// an edit under its old vault, newer than the move, which no device
		// could open once the entry is opened under the new one. See
		// `moveEntry`.
		db
			.insert(notebookUpdates)
			.select(
				db
					.select({
						// Every column, in order, is what an insert from a select takes;
						// a null seq is the next one, as it would be from `values()`.
						seq: sql<number>`null`.as('seq'),
						id: sql<string>`${update.id}`.as('id'),
						entryId: notebookEntries.id,
						authorUserId: sql<string>`${userId}`.as('author_user_id'),
						vaultId: notebookEntries.vaultId,
						payloadVersion: sql<number>`${update.payloadVersion}`.as('payload_version'),
						ciphertext: sql<string>`${update.ciphertext}`.as('ciphertext'),
						createdAt: sql<Date>`${now.getTime()}`.as('created_at')
					})
					.from(notebookEntries)
					.where(
						and(
							eq(notebookEntries.id, context.entry.id),
							eq(notebookEntries.vaultId, update.vaultId)
						)
					)
			)
			.returning({ seq: notebookUpdates.seq }),
		// A no-op unless the stamp is stale, so most batches write one row.
		db
			.update(notebookEntries)
			.set({ lastEditedAt: now, lastEditedByUserId: userId })
			.where(
				and(
					eq(notebookEntries.id, context.entry.id),
					or(
						lt(notebookEntries.lastEditedAt, new Date(now.getTime() - LAST_EDITED_RESOLUTION_MS)),
						sql`${notebookEntries.lastEditedByUserId} IS NOT ${userId}`
					)
				)
			)
	]);
	const seq = inserted[0]?.seq;
	if (seq === undefined) {
		// The entry was moved to another vault since it was read: the device
		// reloads it and sends the edit again, sealed for where it is now.
		return { ok: false, reason: 'wrong-vault' };
	}
	return { ok: true, seq, duplicate: false };
}

/** A stored edit, as the browser opens it. */
export type NotebookUpdateView = {
	seq: number;
	id: string;
	vaultId: string;
	payloadVersion: number;
	ciphertext: string;
};

/** The most edits one request returns. A device asks again from the last seq it got. */
export const UPDATE_PAGE_SIZE = 500;

/** Every edit after `afterSeq`, oldest first, a page at a time. */
export async function listUpdatesAfter(
	db: Db,
	entryId: string,
	afterSeq: number
): Promise<{ updates: NotebookUpdateView[]; more: boolean }> {
	const rows = await db
		.select({
			seq: notebookUpdates.seq,
			id: notebookUpdates.id,
			vaultId: notebookUpdates.vaultId,
			payloadVersion: notebookUpdates.payloadVersion,
			ciphertext: notebookUpdates.ciphertext
		})
		.from(notebookUpdates)
		.where(and(eq(notebookUpdates.entryId, entryId), gt(notebookUpdates.seq, afterSeq)))
		.orderBy(notebookUpdates.seq)
		.limit(UPDATE_PAGE_SIZE + 1);
	return { updates: rows.slice(0, UPDATE_PAGE_SIZE), more: rows.length > UPDATE_PAGE_SIZE };
}

/**
 * Rewrites the entry's sealed title and excerpt.
 *
 * Compare-and-swap on `revision`. A lost race says what the revision now is,
 * so the device can write again over it: the header is a cache of the
 * document, and the device still editing has the newest copy of that.
 */
export async function saveHeader(
	db: Db,
	context: EntryContext,
	header: SealedWrite,
	expectedRevision: number
): Promise<
	| { ok: true; revision: number }
	| { ok: false; reason: 'conflict'; revision: number }
	| { ok: false; reason: Exclude<NotebookRefusal, 'conflict'> }
> {
	if (context.access !== 'edit') {
		return { ok: false, reason: 'read-only' };
	}
	if (!sealedIsAcceptable(notebookEntryKind, header.ciphertext, header.payloadVersion)) {
		return { ok: false, reason: 'bad-content' };
	}
	if (header.vaultId !== context.entry.vaultId) {
		return { ok: false, reason: 'wrong-vault' };
	}
	const rows = await db
		.update(notebookEntries)
		.set({
			ciphertext: header.ciphertext,
			payloadVersion: header.payloadVersion,
			revision: expectedRevision + 1
		})
		.where(
			and(eq(notebookEntries.id, context.entry.id), eq(notebookEntries.revision, expectedRevision))
		)
		.returning({ revision: notebookEntries.revision });
	const [row] = rows;
	if (row) {
		return { ok: true, revision: row.revision };
	}
	const [current] = await db
		.select({ revision: notebookEntries.revision })
		.from(notebookEntries)
		.where(eq(notebookEntries.id, context.entry.id))
		.limit(1);
	return current
		? { ok: false, reason: 'conflict', revision: current.revision }
		: { ok: false, reason: 'not-found' };
}

/** Every version of an entry, newest first. */
export async function listVersions(db: Db, entryId: string): Promise<NotebookVersionView[]> {
	const rows = await db
		.select({
			id: notebookVersions.id,
			upToSeq: notebookVersions.upToSeq,
			createdAt: notebookVersions.createdAt,
			contributorUserIds: notebookVersions.contributorUserIds,
			restoredFromVersionId: notebookVersions.restoredFromVersionId,
			createdByUserId: notebookVersions.createdByUserId
		})
		.from(notebookVersions)
		.where(eq(notebookVersions.entryId, entryId))
		.orderBy(desc(notebookVersions.upToSeq));
	return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/** The newest version, which a device opening the entry starts from. */
export async function latestVersion(
	db: Db,
	entryId: string
): Promise<{ id: string; upToSeq: number; vaultId: string; payloadVersion: number } | null> {
	const [row] = await db
		.select({
			id: notebookVersions.id,
			upToSeq: notebookVersions.upToSeq,
			vaultId: notebookVersions.vaultId,
			payloadVersion: notebookVersions.payloadVersion
		})
		.from(notebookVersions)
		.where(eq(notebookVersions.entryId, entryId))
		.orderBy(desc(notebookVersions.upToSeq))
		.limit(1);
	return row ?? null;
}

/** One version's metadata, if it belongs to the entry. */
export async function getVersion(
	db: Db,
	entryId: string,
	versionId: string
): Promise<{ id: string; upToSeq: number; vaultId: string; payloadVersion: number } | null> {
	const [row] = await db
		.select({
			id: notebookVersions.id,
			upToSeq: notebookVersions.upToSeq,
			vaultId: notebookVersions.vaultId,
			payloadVersion: notebookVersions.payloadVersion
		})
		.from(notebookVersions)
		.where(and(eq(notebookVersions.id, versionId), eq(notebookVersions.entryId, entryId)))
		.limit(1);
	return row ?? null;
}

/**
 * Stores an automatic version, then deletes the edits two versions now cover.
 *
 * A version must cover more than the last one did and no more than has been
 * stored; anything else is `stale` (another device got there first, which is
 * the common case when two people stop typing at once) and costs nothing.
 *
 * The snapshot goes to the media store before its row, so a row never points
 * at nothing; if the row then loses a race, the orphaned object is deleted.
 * Compaction runs last and keeps one version's margin; see `compactionBound`.
 */
export async function createVersion(
	db: Db,
	store: MediaStore,
	context: EntryContext,
	userId: string,
	input: {
		id: string;
		upToSeq: number;
		snapshot: SealedWrite;
		restoredFromVersionId: string | null;
	}
): Promise<NotebookResult<{ compacted: number }>> {
	if (context.access !== 'edit') {
		return { ok: false, reason: 'read-only' };
	}
	const { snapshot } = input;
	if (!sealedIsAcceptable(notebookSnapshotKind, snapshot.ciphertext, snapshot.payloadVersion)) {
		return { ok: false, reason: 'bad-content' };
	}
	if (snapshot.vaultId !== context.entry.vaultId) {
		return { ok: false, reason: 'wrong-vault' };
	}
	const entryId = context.entry.id;
	const [[latest], [stored]] = await db.batch([
		db
			.select({ upToSeq: max(notebookVersions.upToSeq) })
			.from(notebookVersions)
			.where(eq(notebookVersions.entryId, entryId)),
		db
			.select({ seq: max(notebookUpdates.seq) })
			.from(notebookUpdates)
			.where(eq(notebookUpdates.entryId, entryId))
	]);
	const previous = latest?.upToSeq ?? 0;
	if (input.upToSeq <= previous || input.upToSeq > (stored?.seq ?? 0)) {
		return { ok: false, reason: 'stale' };
	}

	const contributors = await db
		.selectDistinct({ userId: notebookUpdates.authorUserId })
		.from(notebookUpdates)
		.where(
			and(
				eq(notebookUpdates.entryId, entryId),
				gt(notebookUpdates.seq, previous),
				lte(notebookUpdates.seq, input.upToSeq)
			)
		);

	const key = notebookSnapshotKey(context.entry, input.id);
	const bytes = new TextEncoder().encode(snapshot.ciphertext);
	// A Response's body rather than a hand-made ReadableStream: R2 refuses a
	// stream whose length it cannot know ("Provided readable stream must have a
	// known length"), and a body made from bytes carries theirs. Only the
	// Workers e2e run (`npm run test:e2e:worker`) could see this: every other
	// store takes any stream.
	await store.put(key, new Response(bytes).body as ReadableStream<Uint8Array>, bytes.byteLength);
	try {
		await db.insert(notebookVersions).values({
			id: input.id,
			entryId,
			upToSeq: input.upToSeq,
			vaultId: snapshot.vaultId,
			payloadVersion: snapshot.payloadVersion,
			size: snapshot.ciphertext.length,
			contributorUserIds: contributors.flatMap((row) => (row.userId ? [row.userId] : [])),
			restoredFromVersionId: input.restoredFromVersionId,
			createdByUserId: userId
		});
	} catch {
		// Another device's version for the same seq, or a reused id. Either way
		// the object just written is nobody's, so it goes.
		await store.delete([key]).catch(() => undefined);
		return { ok: false, reason: 'stale' };
	}

	return { ok: true, compacted: await compact(db, entryId) };
}

/** Deletes the edits that two versions now cover. Returns how many went. */
async function compact(db: Db, entryId: string): Promise<number> {
	const versions = await db
		.select({ upToSeq: notebookVersions.upToSeq })
		.from(notebookVersions)
		.where(eq(notebookVersions.entryId, entryId))
		.orderBy(desc(notebookVersions.upToSeq))
		.limit(2);
	const bound = compactionBound(versions.map((row) => row.upToSeq));
	if (bound === null) {
		return 0;
	}
	const deleted = await db
		.delete(notebookUpdates)
		.where(and(eq(notebookUpdates.entryId, entryId), lte(notebookUpdates.seq, bound)))
		.returning({ seq: notebookUpdates.seq });
	return deleted.length;
}

/** A version's sealed snapshot, as stored. Null when the object is missing. */
export async function readVersionSnapshot(
	store: MediaStore,
	entry: EntryContext['entry'],
	versionId: string
): Promise<string | null> {
	const object = await store.get(notebookSnapshotKey(entry, versionId));
	if (!object) {
		return null;
	}
	return await new Response(object.body).text();
}

/**
 * Changes who else may see or edit a partnership entry.
 *
 * `canSetAccess` is re-checked against the stored rows, never taken from the
 * page (invariant 14). Setting `edit` clears who set it, since there is then
 * no restriction for anyone to own.
 */
export async function setPartnerAccess(
	db: Db,
	context: EntryContext,
	userId: string,
	access: PartnerAccess
): Promise<NotebookResult> {
	if (!(context.partnership && context.canSetAccess)) {
		return { ok: false, reason: 'not-found' };
	}
	await db
		.update(notebookEntries)
		.set({ partnerAccess: access, accessSetByUserId: access === 'edit' ? null : userId })
		.where(eq(notebookEntries.id, context.entry.id));
	return { ok: true };
}

/**
 * Lifts a restriction set against `userId` on an entry hidden from them,
 * which is the one thing they can do with it. Only allowed once the say over
 * it has moved away from whoever set it; see `canSetAccess`.
 */
export async function liftHiddenEntry(
	db: Db,
	entryId: string,
	userId: string,
	partnershipId: string
): Promise<NotebookResult> {
	const partnership = await sharedSpaceForAccess(db, partnershipId, userId);
	if (!partnership) {
		return { ok: false, reason: 'not-found' };
	}
	const [row] = await db
		.select({
			partnerAccess: notebookEntries.partnerAccess,
			accessSetByUserId: notebookEntries.accessSetByUserId,
			createdByUserId: notebookEntries.createdByUserId
		})
		.from(notebookEntries)
		.where(and(eq(notebookEntries.id, entryId), eq(notebookEntries.partnershipId, partnershipId)))
		.limit(1);
	if (
		!(
			row &&
			canSetAccess(
				{
					scope: 'partnership',
					partnerAccess: row.partnerAccess,
					accessSetByUserId: row.accessSetByUserId,
					createdByUserId: row.createdByUserId
				},
				userId,
				partnership
			)
		)
	) {
		return { ok: false, reason: 'not-found' };
	}
	await db
		.update(notebookEntries)
		.set({ partnerAccess: 'edit', accessSetByUserId: null })
		.where(eq(notebookEntries.id, entryId));
	return { ok: true };
}

/**
 * Deletes an entry, its edits and its versions' rows (by cascade), then its
 * versions' snapshots. Only someone who may edit it may delete it.
 *
 * The objects go after the rows, and a failure there is reported, not
 * thrown, like `purgePartnershipMedia`: an unreadable orphan is a much smaller
 * problem than an entry that cannot be deleted.
 */
export async function deleteEntry(
	db: Db,
	store: MediaStore,
	context: EntryContext
): Promise<NotebookResult<{ purgeFailed: boolean }>> {
	if (context.access !== 'edit') {
		return { ok: false, reason: 'read-only' };
	}
	await db.delete(notebookEntries).where(eq(notebookEntries.id, context.entry.id));
	try {
		await store.deletePrefix(notebookEntryPrefix(context.entry));
		return { ok: true, purgeFailed: false };
	} catch {
		return { ok: true, purgeFailed: true };
	}
}

/**
 * Whether `userId` may move the entry out of its space: they must be able to
 * write it, and have the say `canMoveEntry` describes. Re-read from the
 * stored rows, like every rule here.
 */
export function mayMoveEntry(context: EntryContext, userId: string): boolean {
	return (
		context.access === 'edit' &&
		canMoveEntry(forAccess(context.entry), userId, context.partnership ?? undefined)
	);
}

/** Where a moved entry's columns point: the target scope's, the mover's own for a solo one. */
function placementIn(
	target: ResolvedScope,
	userId: string
): { ownerId: string | null; partnershipId: string | null; spaceId: string } {
	return target.scope.kind === 'self'
		? { ownerId: userId, partnershipId: null, spaceId: target.spaceId }
		: { ownerId: null, partnershipId: target.scope.partnershipId, spaceId: target.spaceId };
}

/** Why a move cannot even start, or null when it can. */
function moveRefusal(
	context: EntryContext,
	userId: string,
	target: ResolvedScope,
	vaultId: string
): NotebookRefusal | null {
	if (!mayMoveEntry(context, userId)) {
		return 'read-only';
	}
	if (target.spaceId === entrySpaceId(context.entry)) {
		return 'same-space';
	}
	if (!vaultMatches(target, vaultId)) {
		return 'wrong-vault';
	}
	return null;
}

/** The media store key a version takes once the entry is in `target`. */
function stagedKey(
	context: EntryContext,
	target: ResolvedScope,
	userId: string,
	versionId: string
): string {
	return notebookSnapshotKey({ id: context.entry.id, ...placementIn(target, userId) }, versionId);
}

/**
 * The first half of moving an entry: one version's snapshot, re-sealed by
 * the mover's device under the target space's vault, stored where it will
 * live once the move is committed. Versions go one request each, so a long
 * history never makes one request too large. See docs/notebook.md, "Moving
 * an entry".
 *
 * `id` is a version the entry has, or a new one: the head version the move
 * cuts. A new id must not be anyone else's version.
 */
export async function stageMovedVersion(
	db: Db,
	store: MediaStore,
	context: EntryContext,
	userId: string,
	target: ResolvedScope,
	input: { id: string; snapshot: SealedWrite }
): Promise<NotebookResult> {
	const { snapshot } = input;
	const refusal = moveRefusal(context, userId, target, snapshot.vaultId);
	if (refusal) {
		return { ok: false, reason: refusal };
	}
	if (!sealedIsAcceptable(notebookSnapshotKind, snapshot.ciphertext, snapshot.payloadVersion)) {
		return { ok: false, reason: 'bad-content' };
	}
	const [existing] = await db
		.select({ entryId: notebookVersions.entryId })
		.from(notebookVersions)
		.where(eq(notebookVersions.id, input.id))
		.limit(1);
	if (existing && existing.entryId !== context.entry.id) {
		return { ok: false, reason: 'exists' };
	}
	const bytes = new TextEncoder().encode(snapshot.ciphertext);
	// A Response's body, for the length R2 needs: see `createVersion`.
	await store.put(
		stagedKey(context, target, userId, input.id),
		new Response(bytes).body as ReadableStream<Uint8Array>,
		bytes.byteLength
	);
	return { ok: true };
}

/** A staged version as the commit names it: what its row will say once moved. */
export type MovedVersion = { id: string; payloadVersion: number; size: number };

/**
 * The second half of moving an entry to another space: everything the
 * device staged becomes the entry, in one batch.
 *
 * The device re-sealed every version (`stageMovedVersion`) and, when there
 * were edits after the newest, cut a new head version covering them all, so
 * no stored edit needs re-sealing: every one up to `upToSeq` is deleted, the
 * head snapshot carrying them. The entry row takes the target's scope, vault
 * and re-sealed header, and its access goes back to the default, since a
 * restriction is between the members of the space it was set in.
 *
 * The batch is conditioned, statement by statement, on the entry row's move
 * having happened: that is conditioned on its revision, its old vault, and
 * there being no edit after `upToSeq`. An edit stored after the device
 * staged (another device typing) makes it `stale`, and nothing changes; an
 * edit arriving after the commit is refused as `wrong-vault` by
 * `appendUpdate`'s own condition, and its device reloads and resends it.
 *
 * The old prefix's snapshots go after the rows, and a failure there is
 * reported rather than thrown, as in `deleteEntry`. On `stale`, the staged
 * objects go instead.
 */
export async function moveEntry(
	db: Db,
	store: MediaStore,
	context: EntryContext,
	userId: string,
	target: ResolvedScope,
	input: {
		revision: number;
		upToSeq: number;
		header: SealedWrite;
		versions: MovedVersion[];
		head: MovedVersion | null;
	}
): Promise<NotebookResult<{ purgeFailed: boolean }>> {
	const { header } = input;
	const refusal = moveRefusal(context, userId, target, header.vaultId);
	if (refusal) {
		return { ok: false, reason: refusal };
	}
	if (!sealedIsAcceptable(notebookEntryKind, header.ciphertext, header.payloadVersion)) {
		return { ok: false, reason: 'bad-content' };
	}
	const { entry } = context;
	const newVaultId = header.vaultId;
	const [stored, [latestSeq]] = await db.batch([
		db
			.select({ id: notebookVersions.id, upToSeq: notebookVersions.upToSeq })
			.from(notebookVersions)
			.where(eq(notebookVersions.entryId, entry.id)),
		db
			.select({ seq: max(notebookUpdates.seq) })
			.from(notebookUpdates)
			.where(eq(notebookUpdates.entryId, entry.id))
	]);
	const newestVersion = Math.max(0, ...stored.map((row) => row.upToSeq));
	const storedIds = new Set(stored.map((row) => row.id));
	const namedIds = new Set(input.versions.map((version) => version.id));
	// Up to date with what is stored, or it would leave something out: a
	// version cut, or an edit stored, since the device read the entry.
	const current =
		input.upToSeq === Math.max(latestSeq?.seq ?? 0, newestVersion) &&
		storedIds.size === namedIds.size &&
		[...storedIds].every((id) => namedIds.has(id)) &&
		// A head exactly when there are edits after the newest version.
		(input.head !== null) === input.upToSeq > newestVersion &&
		(input.head === null || !storedIds.has(input.head.id));
	const staged = [...input.versions, ...(input.head ? [input.head] : [])];
	const stagedKeys = staged.map((version) => stagedKey(context, target, userId, version.id));
	const discardStaged = () => store.delete(stagedKeys).catch(() => undefined);
	if (!current) {
		await discardStaged();
		return { ok: false, reason: 'stale' };
	}
	// Every snapshot must be there before any row points at it.
	for (const key of stagedKeys) {
		const object = await store.get(key);
		if (!object) {
			return { ok: false, reason: 'stale' };
		}
		await object.body.cancel();
	}

	const contributors = input.head
		? await db
				.selectDistinct({ userId: notebookUpdates.authorUserId })
				.from(notebookUpdates)
				.where(
					and(
						eq(notebookUpdates.entryId, entry.id),
						gt(notebookUpdates.seq, newestVersion),
						lte(notebookUpdates.seq, input.upToSeq)
					)
				)
		: [];

	const moved = and(eq(notebookEntries.id, entry.id), eq(notebookEntries.vaultId, newVaultId));
	const isMoved = sql`exists (select 1 from ${notebookEntries} where ${moved})`;
	const placement = placementIn(target, userId);
	const now = new Date();
	const [entryRows] = await db.batch([
		db
			.update(notebookEntries)
			.set({
				...placement,
				vaultId: newVaultId,
				ciphertext: header.ciphertext,
				payloadVersion: header.payloadVersion,
				partnerAccess: 'edit',
				accessSetByUserId: null,
				revision: input.revision + 1,
				updatedAt: now
			})
			.where(
				and(
					eq(notebookEntries.id, entry.id),
					eq(notebookEntries.vaultId, entry.vaultId),
					eq(notebookEntries.revision, input.revision),
					sql`not exists (select 1 from ${notebookUpdates} where ${notebookUpdates.entryId} = ${entry.id} and ${notebookUpdates.seq} > ${input.upToSeq})`
				)
			)
			.returning({ id: notebookEntries.id }),
		...input.versions.map((version) =>
			db
				.update(notebookVersions)
				.set({ vaultId: newVaultId, payloadVersion: version.payloadVersion, size: version.size })
				.where(
					and(eq(notebookVersions.id, version.id), eq(notebookVersions.entryId, entry.id), isMoved)
				)
		),
		...(input.head
			? [
					db.insert(notebookVersions).select(
						db
							.select({
								// Every column, in order, as `appendUpdate`'s insert.
								id: sql<string>`${input.head.id}`.as('id'),
								entryId: notebookEntries.id,
								upToSeq: sql<number>`${input.upToSeq}`.as('up_to_seq'),
								vaultId: notebookEntries.vaultId,
								payloadVersion: sql<number>`${input.head.payloadVersion}`.as('payload_version'),
								size: sql<number>`${input.head.size}`.as('size'),
								contributorUserIds: sql<string>`${JSON.stringify(
									contributors.flatMap((row) => (row.userId ? [row.userId] : []))
								)}`.as('contributor_user_ids'),
								restoredFromVersionId: sql<null>`null`.as('restored_from_version_id'),
								createdByUserId: sql<string>`${userId}`.as('created_by_user_id'),
								createdAt: sql<Date>`${now.getTime()}`.as('created_at')
							})
							.from(notebookEntries)
							.where(moved)
					)
				]
			: []),
		// Every edit is in a snapshot now, sealed under the new vault.
		db
			.delete(notebookUpdates)
			.where(
				and(eq(notebookUpdates.entryId, entry.id), lte(notebookUpdates.seq, input.upToSeq), isMoved)
			)
	]);
	if (entryRows.length === 0) {
		await discardStaged();
		return { ok: false, reason: 'stale' };
	}
	try {
		await store.deletePrefix(notebookEntryPrefix(entry));
		return { ok: true, purgeFailed: false };
	} catch {
		return { ok: true, purgeFailed: true };
	}
}
