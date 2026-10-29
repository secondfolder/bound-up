import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { assertNever } from '../assert-never';
import { indexTree, newestLeaf, pathTo } from '../dream/tree';
import type {
	DreamListItemView,
	DreamNoteView,
	DreamPreferencesView,
	DreamTreeNodeView,
	DreamTurnRole,
	DreamTurnView,
	DreamView
} from '../dream/views';
import type { SealedKind } from '../sealed';
import {
	dreamDetailKind,
	dreamPreferencesKind,
	dreamSetupKind,
	dreamSummaryKind,
	dreamTurnKind
} from '../sealed-kinds/dreams';
import type { SealedRefView } from '../types';
import type { Db } from './db';
import { dreamDetails, dreamPreferences, dreamSummaries, dreams, dreamTurns } from './db/schema';
import { type SealedWrite, sealedIsAcceptable, selfVaultIdFor } from './sealed-content';
import { soloSpaceIdOf } from './spaces';

/**
 * Every database access for the new daydream engine (docs/dreams.md,
 * "Storage"). Everything is the owner's alone: every query is scoped to the
 * owner, and someone else's id reads exactly like one that does not exist.
 * The server checks the envelope and that it is sealed under the owner's own
 * vault; it never reads content.
 */

/** Why a write was refused. The page turns these into words. */
export type DreamRefusal =
	| 'bad-content'
	| 'wrong-vault'
	| 'id-taken'
	| 'not-found'
	| 'conflict'
	| 'bad-parent';

export type DreamResult<T = object> = ({ ok: true } & T) | { ok: false; reason: DreamRefusal };

/** A refusal in words for the page, and the status it goes with. */
export function describeDreamRefusal(reason: DreamRefusal): { status: number; message: string } {
	switch (reason) {
		case 'not-found':
			return { status: 404, message: 'That daydream is not there any more.' };
		case 'conflict':
			return {
				status: 409,
				message:
					'This changed somewhere else since you opened it. Reload to see the latest, then try again.'
			};
		case 'bad-parent':
			return {
				status: 409,
				message: 'That part of the story is not there any more. Reload to see the latest.'
			};
		case 'wrong-vault':
			return {
				status: 409,
				message: 'Something changed since this page loaded. Reload and try again.'
			};
		case 'id-taken':
			return {
				status: 409,
				message: 'This may already have been saved. Reload to check before trying again.'
			};
		case 'bad-content':
			return { status: 400, message: 'That could not be saved. Reload and try again.' };
		default:
			return assertNever(reason);
	}
}

/** The most of the branch being read that a page loads; older turns stay stored. */
export const MAX_LOADED_TURNS = 400;
/** The most of the tree a page loads: the newest, by when they were written. */
export const MAX_TREE_NODES = 2000;
/** The most rows one `inArray` reads: D1 allows 100 bound parameters a statement. */
export const MAX_READ_IDS = 90;

async function contentProblem(
	db: Db,
	userId: string,
	kind: SealedKind<unknown>,
	content: SealedWrite
): Promise<'bad-content' | 'wrong-vault' | null> {
	if (!sealedIsAcceptable(kind, content.ciphertext, content.payloadVersion)) {
		return 'bad-content';
	}
	return content.vaultId === (await selfVaultIdFor(db, userId)) ? null : 'wrong-vault';
}

function ref(row: {
	id: string;
	vaultId: string;
	ciphertext: string;
	payloadVersion: number;
}): SealedRefView {
	return {
		recordId: row.id,
		vaultId: row.vaultId,
		ciphertext: row.ciphertext,
		payloadVersion: row.payloadVersion
	};
}

/** Runs `read` over `ids` in chunks D1 accepts. */
async function inChunks<T>(
	ids: readonly string[],
	read: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
	const found: T[] = [];
	for (let start = 0; start < ids.length; start += MAX_READ_IDS) {
		found.push(...(await read(ids.slice(start, start + MAX_READ_IDS))));
	}
	return found;
}

// ── daydreams ────────────────────────────────────────────────────────────────

/** The user's daydreams, most recently played first; one never played sorts by when it was made. */
export async function listDreams(db: Db, userId: string): Promise<DreamListItemView[]> {
	const rows = await db
		.select({
			id: dreams.id,
			ciphertext: dreams.ciphertext,
			vaultId: dreams.vaultId,
			payloadVersion: dreams.payloadVersion,
			lastTurnAt: dreams.lastTurnAt,
			createdAt: dreams.createdAt
		})
		.from(dreams)
		.where(eq(dreams.ownerId, userId))
		// `coalesce` rather than NULLS LAST, which older D1 SQLite did not all parse.
		.orderBy(desc(sql`coalesce(${dreams.lastTurnAt}, ${dreams.createdAt})`), asc(dreams.id));
	return rows.map((row) => ({
		id: row.id,
		setup: ref(row),
		lastTurnAt: row.lastTurnAt,
		createdAt: row.createdAt
	}));
}

export async function ownsDream(db: Db, userId: string, dreamId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: dreams.id })
		.from(dreams)
		.where(and(eq(dreams.id, dreamId), eq(dreams.ownerId, userId)))
		.limit(1);
	return Boolean(row);
}

const treeColumns = {
	id: dreamTurns.id,
	parentId: dreamTurns.parentId,
	role: dreamTurns.role,
	depth: dreamTurns.depth,
	createdAt: dreamTurns.createdAt
} as const;

const turnColumns = {
	...treeColumns,
	ciphertext: dreamTurns.ciphertext,
	vaultId: dreamTurns.vaultId,
	payloadVersion: dreamTurns.payloadVersion
} as const;

function toTurnView(row: {
	id: string;
	parentId: string | null;
	role: DreamTurnRole;
	depth: number;
	createdAt: Date;
	ciphertext: string;
	vaultId: string;
	payloadVersion: number;
}): DreamTurnView {
	return {
		id: row.id,
		parentId: row.parentId,
		role: row.role,
		depth: row.depth,
		createdAt: row.createdAt,
		sealed: ref(row)
	};
}

function turnsById(db: Db, dreamId: string, ids: readonly string[]): Promise<DreamTurnView[]> {
	return inChunks(ids, async (chunk) =>
		(
			await db
				.select(turnColumns)
				.from(dreamTurns)
				.where(and(eq(dreamTurns.dreamId, dreamId), inArray(dreamTurns.id, chunk)))
		).map(toTurnView)
	);
}

type NoteTable = typeof dreamDetails | typeof dreamSummaries;

/** Detail or summaries on these turns, oldest first. */
async function notesOn(
	db: Db,
	table: NoteTable,
	dreamId: string,
	turnIds: readonly string[]
): Promise<DreamNoteView[]> {
	const rows = await inChunks(turnIds, (chunk) =>
		db
			.select({
				id: table.id,
				turnId: table.turnId,
				createdAt: table.createdAt,
				ciphertext: table.ciphertext,
				vaultId: table.vaultId,
				payloadVersion: table.payloadVersion
			})
			.from(table)
			.where(and(eq(table.dreamId, dreamId), inArray(table.turnId, chunk)))
	);
	return rows
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
		.map((row) => ({ id: row.id, turnId: row.turnId, createdAt: row.createdAt, sealed: ref(row) }));
}

/**
 * A daydream as its page shows it, or null when it is not the user's: the
 * tree's shape without content, and the branch being read with it, its
 * detail and its summaries. Other branches are read when the user moves to
 * them (`readDreamBranch`); D1 charges for rows read, and a long story with
 * many versions would otherwise send all of them on every visit.
 */
export async function getDream(db: Db, userId: string, dreamId: string): Promise<DreamView | null> {
	const [row] = await db
		.select({
			id: dreams.id,
			revision: dreams.revision,
			ciphertext: dreams.ciphertext,
			vaultId: dreams.vaultId,
			payloadVersion: dreams.payloadVersion,
			activeTurnId: dreams.activeTurnId
		})
		.from(dreams)
		.where(and(eq(dreams.id, dreamId), eq(dreams.ownerId, userId)))
		.limit(1);
	if (!row) {
		return null;
	}
	const nodes: DreamTreeNodeView[] = (
		await db
			.select(treeColumns)
			.from(dreamTurns)
			.where(eq(dreamTurns.dreamId, dreamId))
			.orderBy(desc(dreamTurns.createdAt), desc(dreamTurns.id))
			.limit(MAX_TREE_NODES)
	).reverse();
	const index = indexTree(nodes);
	const activeTurnId =
		row.activeTurnId !== null && index.byId.has(row.activeTurnId)
			? row.activeTurnId
			: (newestLeaf(index)?.id ?? null);
	const branch = await readBranch(db, dreamId, nodes, activeTurnId);
	return {
		id: row.id,
		revision: row.revision,
		setup: ref(row),
		activeTurnId,
		tree: nodes,
		...branch
	};
}

async function readBranch(
	db: Db,
	dreamId: string,
	nodes: readonly DreamTreeNodeView[],
	turnId: string | null
): Promise<Pick<DreamView, 'path' | 'details' | 'summaries'>> {
	const ids = pathTo(indexTree(nodes), turnId)
		.slice(-MAX_LOADED_TURNS)
		.map((node) => node.id);
	const [turns, details, summaries] = await Promise.all([
		turnsById(db, dreamId, ids),
		notesOn(db, dreamDetails, dreamId, ids),
		notesOn(db, dreamSummaries, dreamId, ids)
	]);
	const byId = new Map(turns.map((turn) => [turn.id, turn]));
	return {
		path: ids.map((id) => byId.get(id)).filter((turn) => turn !== undefined),
		details,
		summaries
	};
}

/**
 * Another branch, for moving to it: the path to `turnId` with its detail and
 * summaries. Null when the daydream is not the user's or the turn not in it.
 */
export async function readDreamBranch(
	db: Db,
	userId: string,
	dreamId: string,
	turnId: string
): Promise<Pick<DreamView, 'path' | 'details' | 'summaries'> | null> {
	if (!(await ownsDream(db, userId, dreamId))) {
		return null;
	}
	const nodes: DreamTreeNodeView[] = (
		await db
			.select(treeColumns)
			.from(dreamTurns)
			.where(eq(dreamTurns.dreamId, dreamId))
			.orderBy(desc(dreamTurns.createdAt), desc(dreamTurns.id))
			.limit(MAX_TREE_NODES)
	).reverse();
	if (!nodes.some((node) => node.id === turnId)) {
		return null;
	}
	return await readBranch(db, dreamId, nodes, turnId);
}

/** Creates a daydream under the id the browser chose and sealed its setup to. */
export async function createDream(
	db: Db,
	userId: string,
	dreamId: string,
	setup: SealedWrite
): Promise<DreamResult> {
	const problem = await contentProblem(db, userId, dreamSetupKind, setup);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const inserted = await db
		.insert(dreams)
		.values({
			id: dreamId,
			ownerId: userId,
			// Solo for now (docs/spaces.md).
			spaceId: soloSpaceIdOf(userId),
			ciphertext: setup.ciphertext,
			vaultId: setup.vaultId,
			payloadVersion: setup.payloadVersion
		})
		.onConflictDoNothing()
		.returning({ id: dreams.id });
	return inserted.length > 0 ? { ok: true } : { ok: false, reason: 'id-taken' };
}

/**
 * Replaces a daydream's setup, compare-and-swap on `revision`: two tabs
 * setting up the same daydream cannot silently overwrite each other's step.
 */
export async function updateDreamSetup(
	db: Db,
	userId: string,
	dreamId: string,
	input: { setup: SealedWrite; expectedRevision: number }
): Promise<DreamResult<{ revision: number }>> {
	const problem = await contentProblem(db, userId, dreamSetupKind, input.setup);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const revision = input.expectedRevision + 1;
	const rows = await db
		.update(dreams)
		.set({
			ciphertext: input.setup.ciphertext,
			vaultId: input.setup.vaultId,
			payloadVersion: input.setup.payloadVersion,
			revision,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(dreams.id, dreamId),
				eq(dreams.ownerId, userId),
				eq(dreams.revision, input.expectedRevision)
			)
		)
		.returning({ id: dreams.id });
	if (rows.length > 0) {
		return { ok: true, revision };
	}
	return { ok: false, reason: (await ownsDream(db, userId, dreamId)) ? 'conflict' : 'not-found' };
}

/** Deletes a daydream and, by cascade, everything in it. False when it was not the user's. */
export async function deleteDream(db: Db, userId: string, dreamId: string): Promise<boolean> {
	const rows = await db
		.delete(dreams)
		.where(and(eq(dreams.id, dreamId), eq(dreams.ownerId, userId)))
		.returning({ id: dreams.id });
	return rows.length > 0;
}

// ── turns ────────────────────────────────────────────────────────────────────

async function turnIn(db: Db, dreamId: string, turnId: string) {
	const [turn] = await db
		.select({ depth: dreamTurns.depth })
		.from(dreamTurns)
		.where(and(eq(dreamTurns.id, turnId), eq(dreamTurns.dreamId, dreamId)))
		.limit(1);
	return turn;
}

/**
 * Adds a turn after `parentId` (null for an opening) and makes it the turn
 * the user is on. Nothing is ever in the way: two devices adding after the
 * same turn make two branches. The id is the caller's and kept across retries
 * of the same save, so a save whose answer was lost cannot add it twice.
 */
export async function appendDreamTurn(
	db: Db,
	userId: string,
	dreamId: string,
	turn: { id: string; parentId: string | null; role: DreamTurnRole; content: SealedWrite },
	now = new Date()
): Promise<DreamResult<{ depth: number }>> {
	if (!(await ownsDream(db, userId, dreamId))) {
		return { ok: false, reason: 'not-found' };
	}
	const problem = await contentProblem(db, userId, dreamTurnKind, turn.content);
	if (problem) {
		return { ok: false, reason: problem };
	}
	let depth = 0;
	if (turn.parentId !== null) {
		const parent = await turnIn(db, dreamId, turn.parentId);
		if (!parent) {
			return { ok: false, reason: 'bad-parent' };
		}
		depth = parent.depth + 1;
	}
	const inserted = await db
		.insert(dreamTurns)
		.values({
			id: turn.id,
			dreamId,
			parentId: turn.parentId,
			role: turn.role,
			depth,
			ciphertext: turn.content.ciphertext,
			vaultId: turn.content.vaultId,
			payloadVersion: turn.content.payloadVersion,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing()
		.returning({ id: dreamTurns.id });
	if (inserted.length === 0) {
		return { ok: false, reason: 'id-taken' };
	}
	await db
		.update(dreams)
		.set({ lastTurnAt: now, activeTurnId: turn.id })
		.where(and(eq(dreams.id, dreamId), eq(dreams.ownerId, userId)));
	return { ok: true, depth };
}

/** Moves the user to another turn: another version, or back to an earlier point. */
export async function setActiveDreamTurn(
	db: Db,
	userId: string,
	dreamId: string,
	turnId: string
): Promise<DreamResult> {
	if (!(await ownsDream(db, userId, dreamId))) {
		return { ok: false, reason: 'not-found' };
	}
	if (!(await turnIn(db, dreamId, turnId))) {
		return { ok: false, reason: 'bad-parent' };
	}
	await db
		.update(dreams)
		.set({ activeTurnId: turnId })
		.where(and(eq(dreams.id, dreamId), eq(dreams.ownerId, userId)));
	return { ok: true };
}

// ── detail and summaries ─────────────────────────────────────────────────────

/**
 * Keeps detail (`dream-detail`) or a summary (`dream-summary`) on one of the
 * daydream's turns. Never replaced: a newer one is added beside it, and the
 * latest along the branch is the one that counts.
 */
export async function saveDreamNote(
	db: Db,
	userId: string,
	dreamId: string,
	note: { kind: 'detail' | 'summary'; id: string; turnId: string; content: SealedWrite },
	now = new Date()
): Promise<DreamResult> {
	if (!(await ownsDream(db, userId, dreamId))) {
		return { ok: false, reason: 'not-found' };
	}
	const kind = note.kind === 'detail' ? dreamDetailKind : dreamSummaryKind;
	const problem = await contentProblem(db, userId, kind, note.content);
	if (problem) {
		return { ok: false, reason: problem };
	}
	if (!(await turnIn(db, dreamId, note.turnId))) {
		return { ok: false, reason: 'bad-parent' };
	}
	const table = note.kind === 'detail' ? dreamDetails : dreamSummaries;
	const inserted = await db
		.insert(table)
		.values({
			id: note.id,
			dreamId,
			turnId: note.turnId,
			ciphertext: note.content.ciphertext,
			vaultId: note.content.vaultId,
			payloadVersion: note.content.payloadVersion,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing()
		.returning({ id: table.id });
	return inserted.length > 0 ? { ok: true } : { ok: false, reason: 'id-taken' };
}

// ── preferences ──────────────────────────────────────────────────────────────

export async function getDreamPreferences(db: Db, userId: string): Promise<DreamPreferencesView> {
	const [row] = await db
		.select({
			ciphertext: dreamPreferences.ciphertext,
			vaultId: dreamPreferences.vaultId,
			payloadVersion: dreamPreferences.payloadVersion,
			revision: dreamPreferences.revision
		})
		.from(dreamPreferences)
		.where(eq(dreamPreferences.userId, userId))
		.limit(1);
	// Sealed to the user's id: there is one record per user.
	return row ? { revision: row.revision, sealed: ref({ id: userId, ...row }) } : null;
}

/**
 * Saves the user's preferences, compare-and-swap: `expectedRevision` null
 * creates them, and fails as a conflict if another device already did.
 */
export async function saveDreamPreferences(
	db: Db,
	userId: string,
	input: { content: SealedWrite; expectedRevision: number | null }
): Promise<DreamResult<{ revision: number }>> {
	const problem = await contentProblem(db, userId, dreamPreferencesKind, input.content);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const values = {
		ciphertext: input.content.ciphertext,
		vaultId: input.content.vaultId,
		payloadVersion: input.content.payloadVersion
	};
	if (input.expectedRevision === null) {
		const inserted = await db
			.insert(dreamPreferences)
			.values({ userId, ...values })
			.onConflictDoNothing()
			.returning({ userId: dreamPreferences.userId });
		return inserted.length > 0 ? { ok: true, revision: 0 } : { ok: false, reason: 'conflict' };
	}
	const revision = input.expectedRevision + 1;
	const rows = await db
		.update(dreamPreferences)
		.set({ ...values, revision, updatedAt: new Date() })
		.where(
			and(
				eq(dreamPreferences.userId, userId),
				eq(dreamPreferences.revision, input.expectedRevision)
			)
		)
		.returning({ userId: dreamPreferences.userId });
	return rows.length > 0 ? { ok: true, revision } : { ok: false, reason: 'conflict' };
}
