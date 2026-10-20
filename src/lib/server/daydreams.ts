import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { assertNever } from '../assert-never';
import type { DaydreamTurnRole } from '../daydream';
import { MAX_READ_EXCHANGE_TURNS } from '../daydream/exchange';
import { indexTree, pathTo } from '../daydream/tree';
import type { SealedKind } from '../sealed';
import {
	daydreamCharacterKind,
	daydreamExchangeKind,
	daydreamIdeaKind,
	daydreamMarkKind,
	daydreamSetupKind,
	daydreamTurnKind
} from '../sealed-kinds/daydreams';
import type {
	DaydreamExchangeView,
	DaydreamLibraryItemView,
	DaydreamLibraryView,
	DaydreamListItemView,
	DaydreamMarkView,
	DaydreamsWidgetView,
	DaydreamTreeNodeView,
	DaydreamTurnView,
	DaydreamView
} from '../types';
import type { Db } from './db';
import {
	daydreamCharacters,
	daydreamExchanges,
	daydreamIdeas,
	daydreamMarks,
	daydreamPreferences,
	daydreams,
	daydreamTurns
} from './db/schema';
import { daydreamPicturesPrefix, type MediaStore } from './media';
import { type SealedWrite, sealedIsAcceptable, selfVaultIdFor } from './sealed-content';

/**
 * Every database access for Daydreams. See docs/daydreams.md.
 *
 * Everything here is the owner's alone: there is no partner side to a
 * daydream or a library, so every query is scoped to the owner, and someone
 * else's id reads exactly like one that does not exist. The content is sealed; what the
 * server checks is the envelope (`sealedIsAcceptable`) and that it is sealed
 * under the owner's own vault.
 */

/** Why a sealed write was refused. The page turns these into words (`daydreamRefusal`). */
export type DaydreamRefusal =
	| 'bad-content'
	| 'wrong-vault'
	| 'id-taken'
	| 'not-found'
	| 'conflict'
	| 'bad-parent';

export type DaydreamResult<T = object> =
	| ({ ok: true } & T)
	| { ok: false; reason: DaydreamRefusal };

/** The most turns of the branch being read that a page loads. Older ones stay stored; see `getDaydream`. */
export const MAX_LOADED_TURNS = 500;

/** The most of a daydream's tree a page loads: the newest, by when they were written. */
export const MAX_TREE_NODES = 2000;

/** The most marks a page loads. */
export const MAX_MARKS = 500;

/** The most turns one `readTurns` call opens. D1 allows 100 bound parameters a statement. */
export const MAX_READ_TURNS = 100;

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

// ── pictures ─────────────────────────────────────────────────────────────────

/**
 * Deletes a daydream's pictures (docs/daydreams.md, "Pictures"), by prefix,
 * after its row has gone: the delete is what proved it was the owner's.
 * Reports a failure rather than throwing, like `purgePartnershipMedia`:
 * deleting a daydream must never wait on storage, and what is left is
 * ciphertext whose keys went with the daydream's marks.
 */
export async function purgeDaydreamPictures(
	store: MediaStore,
	daydreamId: string
): Promise<{ deleted: number; failed: boolean }> {
	try {
		return { deleted: await store.deletePrefix(daydreamPicturesPrefix(daydreamId)), failed: false };
	} catch {
		return { deleted: 0, failed: true };
	}
}

// ── the disclosure ───────────────────────────────────────────────────────────

/** Whether the user has accepted that what they write goes to a model provider. */
export async function hasAcceptedDisclosure(db: Db, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ at: daydreamPreferences.disclosureAcceptedAt })
		.from(daydreamPreferences)
		.where(eq(daydreamPreferences.userId, userId))
		.limit(1);
	return Boolean(row?.at);
}

/**
 * Idempotent; a second acceptance keeps the first's time. It covers pictures
 * too (docs/daydreams.md, "Pictures"): they go to a third party on the same
 * terms as the passages, which is what the disclosure is about.
 */
export async function acceptDisclosure(db: Db, userId: string, now = new Date()): Promise<void> {
	await db
		.insert(daydreamPreferences)
		.values({ userId, disclosureAcceptedAt: now })
		.onConflictDoUpdate({
			target: daydreamPreferences.userId,
			set: {
				disclosureAcceptedAt: sql`coalesce(${daydreamPreferences.disclosureAcceptedAt}, ${now.getTime()})`
			}
		});
}

// ── daydreams ────────────────────────────────────────────────────────────────

const listColumns = {
	id: daydreams.id,
	ciphertext: daydreams.ciphertext,
	vaultId: daydreams.vaultId,
	payloadVersion: daydreams.payloadVersion,
	lastTurnAt: daydreams.lastTurnAt,
	createdAt: daydreams.createdAt
} as const;

function toListItem(row: {
	id: string;
	ciphertext: string;
	vaultId: string;
	payloadVersion: number;
	lastTurnAt: Date | null;
	createdAt: Date;
}): DaydreamListItemView {
	return {
		id: row.id,
		setup: {
			recordId: row.id,
			vaultId: row.vaultId,
			ciphertext: row.ciphertext,
			payloadVersion: row.payloadVersion
		},
		lastTurnAt: row.lastTurnAt,
		createdAt: row.createdAt
	};
}

/**
 * The user's daydreams, most recently played first; one never played sorts
 * by when it was made. `coalesce` rather than SQLite's NULLS LAST, which
 * D1's older SQLite versions did not all parse.
 */
function newestFirst() {
	return [desc(sql`coalesce(${daydreams.lastTurnAt}, ${daydreams.createdAt})`), asc(daydreams.id)];
}

export async function listDaydreams(db: Db, userId: string): Promise<DaydreamListItemView[]> {
	const rows = await db
		.select(listColumns)
		.from(daydreams)
		.where(eq(daydreams.ownerId, userId))
		.orderBy(...newestFirst());
	return rows.map(toListItem);
}

/** The /home card: the top of the same list, limited in SQL, and how many there are in all. */
export async function getDaydreamsWidget(
	db: Db,
	userId: string,
	limit: number
): Promise<DaydreamsWidgetView> {
	const [rows, total] = await Promise.all([
		db
			.select(listColumns)
			.from(daydreams)
			.where(eq(daydreams.ownerId, userId))
			.orderBy(...newestFirst())
			.limit(limit),
		db.$count(daydreams, eq(daydreams.ownerId, userId))
	]);
	return { daydreams: rows.map(toListItem), total };
}

/** Whether `daydreamId` is one of the user's. */
export async function ownsDaydream(db: Db, userId: string, daydreamId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: daydreams.id })
		.from(daydreams)
		.where(and(eq(daydreams.id, daydreamId), eq(daydreams.ownerId, userId)))
		.limit(1);
	return Boolean(row);
}

const treeColumns = {
	id: daydreamTurns.id,
	parentId: daydreamTurns.parentId,
	role: daydreamTurns.role,
	position: daydreamTurns.position,
	createdAt: daydreamTurns.createdAt
} as const;

const turnColumns = {
	...treeColumns,
	ciphertext: daydreamTurns.ciphertext,
	vaultId: daydreamTurns.vaultId,
	payloadVersion: daydreamTurns.payloadVersion
} as const;

function toTurnView(row: {
	id: string;
	parentId: string | null;
	role: DaydreamTurnRole;
	position: number;
	createdAt: Date;
	ciphertext: string;
	vaultId: string;
	payloadVersion: number;
}): DaydreamTurnView {
	return {
		id: row.id,
		parentId: row.parentId,
		role: row.role,
		position: row.position,
		createdAt: row.createdAt,
		sealed: {
			recordId: row.id,
			vaultId: row.vaultId,
			ciphertext: row.ciphertext,
			payloadVersion: row.payloadVersion
		}
	};
}

/** Turns of one daydream by id, in chunks D1 accepts. Returned in no particular order. */
async function turnsById(
	db: Db,
	daydreamId: string,
	ids: readonly string[]
): Promise<DaydreamTurnView[]> {
	const found: DaydreamTurnView[] = [];
	for (let start = 0; start < ids.length; start += MAX_READ_TURNS) {
		const chunk = ids.slice(start, start + MAX_READ_TURNS);
		const rows = await db
			.select(turnColumns)
			.from(daydreamTurns)
			.where(and(eq(daydreamTurns.daydreamId, daydreamId), inArray(daydreamTurns.id, chunk)));
		found.push(...rows.map(toTurnView));
	}
	return found;
}

/**
 * A daydream as its page shows it, or null when it is not the user's.
 *
 * The whole tree's shape comes without content — ids, parents, roles, depth —
 * because that is cheap and draws the branch map and the switchers. Content
 * comes only for the branch being read: the root down to the active turn,
 * at most `MAX_LOADED_TURNS` of it, the newest. Other branches' turns are
 * opened when someone moves to them (`readTurns`). D1 charges for rows read
 * and their size, and a long story with many retries would otherwise send
 * every take of every passage on every visit.
 */
export async function getDaydream(
	db: Db,
	userId: string,
	daydreamId: string
): Promise<DaydreamView | null> {
	const [row] = await db
		.select({
			id: daydreams.id,
			revision: daydreams.revision,
			ciphertext: daydreams.ciphertext,
			vaultId: daydreams.vaultId,
			payloadVersion: daydreams.payloadVersion,
			activeTurnId: daydreams.activeTurnId
		})
		.from(daydreams)
		.where(and(eq(daydreams.id, daydreamId), eq(daydreams.ownerId, userId)))
		.limit(1);
	if (!row) {
		return null;
	}
	const [tree, marks] = await Promise.all([
		db
			.select(treeColumns)
			.from(daydreamTurns)
			.where(eq(daydreamTurns.daydreamId, daydreamId))
			.orderBy(desc(daydreamTurns.createdAt), desc(daydreamTurns.id))
			.limit(MAX_TREE_NODES),
		listMarks(db, daydreamId)
	]);
	const nodes: DaydreamTreeNodeView[] = tree.reverse();
	const index = indexTree(nodes);
	// An active turn that is missing (never set, or older than the tree loaded)
	// falls back to the newest leaf, which is where the story was last left.
	// `nodes` is oldest first, so that is the last turn with no children.
	const fallback = nodes.findLast((node) => (index.children.get(node.id)?.length ?? 0) === 0);
	const activeTurnId =
		row.activeTurnId !== null && index.byId.has(row.activeTurnId)
			? row.activeTurnId
			: (fallback?.id ?? null);
	const pathIds = pathTo(index, activeTurnId)
		.slice(-MAX_LOADED_TURNS)
		.map((node) => node.id);
	const byId = new Map((await turnsById(db, daydreamId, pathIds)).map((turn) => [turn.id, turn]));
	return {
		id: row.id,
		revision: row.revision,
		setup: {
			recordId: row.id,
			vaultId: row.vaultId,
			ciphertext: row.ciphertext,
			payloadVersion: row.payloadVersion
		},
		activeTurnId,
		tree: nodes,
		path: pathIds.map((id) => byId.get(id)).filter((turn) => turn !== undefined),
		marks
	};
}

/** A daydream's setup alone, for the edit page, which has no use for the conversation. */
export async function getDaydreamSetup(
	db: Db,
	userId: string,
	daydreamId: string
): Promise<Pick<DaydreamView, 'id' | 'revision' | 'setup'> | null> {
	const [row] = await db
		.select({
			id: daydreams.id,
			revision: daydreams.revision,
			ciphertext: daydreams.ciphertext,
			vaultId: daydreams.vaultId,
			payloadVersion: daydreams.payloadVersion
		})
		.from(daydreams)
		.where(and(eq(daydreams.id, daydreamId), eq(daydreams.ownerId, userId)))
		.limit(1);
	return row
		? {
				id: row.id,
				revision: row.revision,
				setup: {
					recordId: row.id,
					vaultId: row.vaultId,
					ciphertext: row.ciphertext,
					payloadVersion: row.payloadVersion
				}
			}
		: null;
}

/** Creates a daydream under the id the browser chose and sealed its setup to. */
export async function createDaydream(
	db: Db,
	userId: string,
	daydreamId: string,
	setup: SealedWrite
): Promise<DaydreamResult> {
	const problem = await contentProblem(db, userId, daydreamSetupKind, setup);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const inserted = await db
		.insert(daydreams)
		.values({
			id: daydreamId,
			ownerId: userId,
			ciphertext: setup.ciphertext,
			vaultId: setup.vaultId,
			payloadVersion: setup.payloadVersion
		})
		.onConflictDoNothing()
		.returning({ id: daydreams.id });
	return inserted.length > 0 ? { ok: true } : { ok: false, reason: 'id-taken' };
}

/** Replaces a daydream's setup, compare-and-swap on `revision` as every sealed edit is. */
export async function updateDaydreamSetup(
	db: Db,
	userId: string,
	daydreamId: string,
	input: { setup: SealedWrite; expectedRevision: number }
): Promise<DaydreamResult> {
	const problem = await contentProblem(db, userId, daydreamSetupKind, input.setup);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const rows = await db
		.update(daydreams)
		.set({
			ciphertext: input.setup.ciphertext,
			vaultId: input.setup.vaultId,
			payloadVersion: input.setup.payloadVersion,
			revision: input.expectedRevision + 1,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(daydreams.id, daydreamId),
				eq(daydreams.ownerId, userId),
				eq(daydreams.revision, input.expectedRevision)
			)
		)
		.returning({ id: daydreams.id });
	if (rows.length > 0) {
		return { ok: true };
	}
	return {
		ok: false,
		reason: (await ownsDaydream(db, userId, daydreamId)) ? 'conflict' : 'not-found'
	};
}

/** Deletes a daydream and, by cascade, its turns and marks. False when it was not the user's. */
export async function deleteDaydream(db: Db, userId: string, daydreamId: string): Promise<boolean> {
	const rows = await db
		.delete(daydreams)
		.where(and(eq(daydreams.id, daydreamId), eq(daydreams.ownerId, userId)))
		.returning({ id: daydreams.id });
	return rows.length > 0;
}

// ── turns ────────────────────────────────────────────────────────────────────

/**
 * Adds a turn to the tree, after `parentId` (null for a root: the opening, or
 * a retried opening), and makes it the turn the user is on.
 *
 * Nothing is ever in the way: two devices adding after the same turn simply
 * make two branches, which is what the tree is for. The parent must be one of
 * this daydream's turns; the id is the caller's and kept across retries of
 * the same save, so a save whose answer was lost cannot add the turn twice.
 */
export async function appendTurn(
	db: Db,
	userId: string,
	daydreamId: string,
	turn: { id: string; parentId: string | null; role: DaydreamTurnRole; content: SealedWrite },
	now = new Date()
): Promise<DaydreamResult<{ position: number }>> {
	if (!(await ownsDaydream(db, userId, daydreamId))) {
		return { ok: false, reason: 'not-found' };
	}
	const problem = await contentProblem(db, userId, daydreamTurnKind, turn.content);
	if (problem) {
		return { ok: false, reason: problem };
	}
	let position = 0;
	if (turn.parentId !== null) {
		const [parent] = await db
			.select({ position: daydreamTurns.position })
			.from(daydreamTurns)
			.where(and(eq(daydreamTurns.id, turn.parentId), eq(daydreamTurns.daydreamId, daydreamId)))
			.limit(1);
		if (!parent) {
			return { ok: false, reason: 'bad-parent' };
		}
		position = parent.position + 1;
	}
	const inserted = await db
		.insert(daydreamTurns)
		.values({
			id: turn.id,
			daydreamId,
			parentId: turn.parentId,
			role: turn.role,
			position,
			ciphertext: turn.content.ciphertext,
			vaultId: turn.content.vaultId,
			payloadVersion: turn.content.payloadVersion,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing()
		.returning({ id: daydreamTurns.id });
	if (inserted.length === 0) {
		return { ok: false, reason: 'id-taken' };
	}
	await db
		.update(daydreams)
		.set({ lastTurnAt: now, activeTurnId: turn.id })
		.where(and(eq(daydreams.id, daydreamId), eq(daydreams.ownerId, userId)));
	return { ok: true, position };
}

/** Moves the user to another turn: switching branch, or carrying on from an earlier point. */
export async function setActiveTurn(
	db: Db,
	userId: string,
	daydreamId: string,
	turnId: string
): Promise<DaydreamResult> {
	if (!(await ownsDaydream(db, userId, daydreamId))) {
		return { ok: false, reason: 'not-found' };
	}
	const [turn] = await db
		.select({ id: daydreamTurns.id })
		.from(daydreamTurns)
		.where(and(eq(daydreamTurns.id, turnId), eq(daydreamTurns.daydreamId, daydreamId)))
		.limit(1);
	if (!turn) {
		return { ok: false, reason: 'bad-parent' };
	}
	await db
		.update(daydreams)
		.set({ activeTurnId: turnId })
		.where(and(eq(daydreams.id, daydreamId), eq(daydreams.ownerId, userId)));
	return { ok: true };
}

/**
 * Turns by id, sealed: the other branches' turns, opened when someone moves
 * to them or the branch map shows them. Null when the daydream is not the
 * user's; ids that are not this daydream's are simply not returned.
 */
export async function readTurns(
	db: Db,
	userId: string,
	daydreamId: string,
	ids: readonly string[]
): Promise<DaydreamTurnView[] | null> {
	if (!(await ownsDaydream(db, userId, daydreamId))) {
		return null;
	}
	return await turnsById(db, daydreamId, ids.slice(0, MAX_READ_TURNS));
}

// ── exchanges ────────────────────────────────────────────────────────────────

/**
 * Keeps one request to the model and its answer (`daydream-exchange`), for
 * debug mode's raw log. The caller has checked the account holds debug mode;
 * this checks the daydream is theirs, the envelope, and that the turns it
 * names are this daydream's. Like a turn, never replaced: the id is the
 * caller's, so a save whose answer was lost cannot keep it twice.
 */
export async function saveExchange(
	db: Db,
	userId: string,
	daydreamId: string,
	exchange: {
		id: string;
		turnId: string | null;
		parentTurnId: string | null;
		content: SealedWrite;
	},
	now = new Date()
): Promise<DaydreamResult> {
	if (!(await ownsDaydream(db, userId, daydreamId))) {
		return { ok: false, reason: 'not-found' };
	}
	const problem = await contentProblem(db, userId, daydreamExchangeKind, exchange.content);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const named = [exchange.turnId, exchange.parentTurnId].filter((id) => id !== null);
	if (named.length > 0) {
		const found = await db
			.select({ id: daydreamTurns.id })
			.from(daydreamTurns)
			.where(and(eq(daydreamTurns.daydreamId, daydreamId), inArray(daydreamTurns.id, named)));
		if (new Set(found.map((row) => row.id)).size !== new Set(named).size) {
			return { ok: false, reason: 'bad-parent' };
		}
	}
	const inserted = await db
		.insert(daydreamExchanges)
		.values({
			id: exchange.id,
			daydreamId,
			turnId: exchange.turnId,
			parentTurnId: exchange.parentTurnId,
			ciphertext: exchange.content.ciphertext,
			vaultId: exchange.content.vaultId,
			payloadVersion: exchange.content.payloadVersion,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing()
		.returning({ id: daydreamExchanges.id });
	return inserted.length > 0 ? { ok: true } : { ok: false, reason: 'id-taken' };
}

/**
 * The exchanges that wrote these turns, and the failed ones that answered
 * them, plus any failed opening (which answered nothing). Null when the
 * daydream is not the user's. Read only while the raw log is open, a few
 * turns at a time.
 */
export async function readExchanges(
	db: Db,
	userId: string,
	daydreamId: string,
	turnIds: readonly string[]
): Promise<DaydreamExchangeView[] | null> {
	if (!(await ownsDaydream(db, userId, daydreamId))) {
		return null;
	}
	const ids = turnIds.slice(0, MAX_READ_EXCHANGE_TURNS);
	const rows = await db
		.select({
			id: daydreamExchanges.id,
			turnId: daydreamExchanges.turnId,
			parentTurnId: daydreamExchanges.parentTurnId,
			createdAt: daydreamExchanges.createdAt,
			ciphertext: daydreamExchanges.ciphertext,
			vaultId: daydreamExchanges.vaultId,
			payloadVersion: daydreamExchanges.payloadVersion
		})
		.from(daydreamExchanges)
		.where(
			and(
				eq(daydreamExchanges.daydreamId, daydreamId),
				or(
					inArray(daydreamExchanges.turnId, ids),
					and(
						isNull(daydreamExchanges.turnId),
						or(inArray(daydreamExchanges.parentTurnId, ids), isNull(daydreamExchanges.parentTurnId))
					)
				)
			)
		)
		.orderBy(asc(daydreamExchanges.createdAt), asc(daydreamExchanges.id));
	return rows.map((row) => ({
		id: row.id,
		turnId: row.turnId,
		parentTurnId: row.parentTurnId,
		createdAt: row.createdAt,
		sealed: {
			recordId: row.id,
			vaultId: row.vaultId,
			ciphertext: row.ciphertext,
			payloadVersion: row.payloadVersion
		}
	}));
}

// ── marks ────────────────────────────────────────────────────────────────────

async function listMarks(db: Db, daydreamId: string): Promise<DaydreamMarkView[]> {
	const rows = await db
		.select({
			id: daydreamMarks.id,
			turnId: daydreamMarks.turnId,
			revision: daydreamMarks.revision,
			ciphertext: daydreamMarks.ciphertext,
			vaultId: daydreamMarks.vaultId,
			payloadVersion: daydreamMarks.payloadVersion
		})
		.from(daydreamMarks)
		.where(eq(daydreamMarks.daydreamId, daydreamId))
		.orderBy(asc(daydreamMarks.createdAt), asc(daydreamMarks.id))
		.limit(MAX_MARKS);
	return rows.map((row) => ({
		id: row.id,
		turnId: row.turnId,
		revision: row.revision,
		sealed: {
			recordId: row.id,
			vaultId: row.vaultId,
			ciphertext: row.ciphertext,
			payloadVersion: row.payloadVersion
		}
	}));
}

/** Adds a bookmark or a reaction to one of the daydream's turns. */
export async function createMark(
	db: Db,
	userId: string,
	daydreamId: string,
	mark: { id: string; turnId: string; content: SealedWrite }
): Promise<DaydreamResult> {
	if (!(await ownsDaydream(db, userId, daydreamId))) {
		return { ok: false, reason: 'not-found' };
	}
	const problem = await contentProblem(db, userId, daydreamMarkKind, mark.content);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const [turn] = await db
		.select({ id: daydreamTurns.id })
		.from(daydreamTurns)
		.where(and(eq(daydreamTurns.id, mark.turnId), eq(daydreamTurns.daydreamId, daydreamId)))
		.limit(1);
	if (!turn) {
		return { ok: false, reason: 'bad-parent' };
	}
	const inserted = await db
		.insert(daydreamMarks)
		.values({
			id: mark.id,
			daydreamId,
			turnId: mark.turnId,
			ciphertext: mark.content.ciphertext,
			vaultId: mark.content.vaultId,
			payloadVersion: mark.content.payloadVersion
		})
		.onConflictDoNothing()
		.returning({ id: daydreamMarks.id });
	return inserted.length > 0 ? { ok: true } : { ok: false, reason: 'id-taken' };
}

/** Removes a mark. False when it was not one of this daydream's, or the daydream not the user's. */
export async function deleteMark(
	db: Db,
	userId: string,
	daydreamId: string,
	markId: string
): Promise<boolean> {
	if (!(await ownsDaydream(db, userId, daydreamId))) {
		return false;
	}
	const rows = await db
		.delete(daydreamMarks)
		.where(and(eq(daydreamMarks.id, markId), eq(daydreamMarks.daydreamId, daydreamId)))
		.returning({ id: daydreamMarks.id });
	return rows.length > 0;
}

// ── the character and idea libraries ────────────────────────────────────────

export type LibraryKind = 'characters' | 'ideas';

/**
 * The two library tables have exactly the same columns, so one set of
 * functions serves both. Typed as the characters table because Drizzle's
 * query builder does not accept a union of tables; the cast is safe because
 * the schemas are identical, which `daydreams.test.ts` exercises for both.
 */
function libraryTable(kind: LibraryKind): typeof daydreamCharacters {
	return (kind === 'characters' ? daydreamCharacters : daydreamIdeas) as typeof daydreamCharacters;
}

function librarySealedKind(kind: LibraryKind): SealedKind<unknown> {
	return kind === 'characters' ? daydreamCharacterKind : daydreamIdeaKind;
}

/** The most library items listed. A library is a person's own; this is a guard, not a page size. */
export const MAX_LIBRARY_ITEMS = 200;

export async function listLibrary(
	db: Db,
	userId: string,
	kind: LibraryKind
): Promise<DaydreamLibraryItemView[]> {
	const table = libraryTable(kind);
	const rows = await db
		.select({
			id: table.id,
			revision: table.revision,
			updatedAt: table.updatedAt,
			ciphertext: table.ciphertext,
			vaultId: table.vaultId,
			payloadVersion: table.payloadVersion
		})
		.from(table)
		.where(eq(table.ownerId, userId))
		.orderBy(desc(table.updatedAt), asc(table.id))
		.limit(MAX_LIBRARY_ITEMS);
	return rows.map((row) => ({
		id: row.id,
		revision: row.revision,
		updatedAt: row.updatedAt,
		sealed: {
			recordId: row.id,
			vaultId: row.vaultId,
			ciphertext: row.ciphertext,
			payloadVersion: row.payloadVersion
		}
	}));
}

/** Both libraries, for the setup pages. */
export async function getLibrary(db: Db, userId: string): Promise<DaydreamLibraryView> {
	const [characters, ideas] = await Promise.all([
		listLibrary(db, userId, 'characters'),
		listLibrary(db, userId, 'ideas')
	]);
	return { characters, ideas };
}

/** Adds a character or idea under the id the browser chose and sealed it to. */
export async function createLibraryItem(
	db: Db,
	userId: string,
	kind: LibraryKind,
	item: { id: string; content: SealedWrite }
): Promise<DaydreamResult<{ revision: number }>> {
	const problem = await contentProblem(db, userId, librarySealedKind(kind), item.content);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const table = libraryTable(kind);
	const inserted = await db
		.insert(table)
		.values({
			id: item.id,
			ownerId: userId,
			ciphertext: item.content.ciphertext,
			vaultId: item.content.vaultId,
			payloadVersion: item.content.payloadVersion
		})
		.onConflictDoNothing()
		.returning({ revision: table.revision });
	const [row] = inserted;
	return row ? { ok: true, revision: row.revision } : { ok: false, reason: 'id-taken' };
}

/**
 * Replaces a character or idea, compare-and-swap on `revision`. The new
 * revision is what daydreams' copies are then compared with, so every copy
 * made before this edit shows as "Updated in your library".
 */
export async function updateLibraryItem(
	db: Db,
	userId: string,
	kind: LibraryKind,
	itemId: string,
	input: { content: SealedWrite; expectedRevision: number }
): Promise<DaydreamResult<{ revision: number }>> {
	const problem = await contentProblem(db, userId, librarySealedKind(kind), input.content);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const table = libraryTable(kind);
	const rows = await db
		.update(table)
		.set({
			ciphertext: input.content.ciphertext,
			vaultId: input.content.vaultId,
			payloadVersion: input.content.payloadVersion,
			revision: input.expectedRevision + 1,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(table.id, itemId),
				eq(table.ownerId, userId),
				eq(table.revision, input.expectedRevision)
			)
		)
		.returning({ revision: table.revision });
	const [row] = rows;
	if (row) {
		return { ok: true, revision: row.revision };
	}
	const [existing] = await db
		.select({ id: table.id })
		.from(table)
		.where(and(eq(table.id, itemId), eq(table.ownerId, userId)))
		.limit(1);
	return { ok: false, reason: existing ? 'conflict' : 'not-found' };
}

/** Deletes a character or idea. Always safe: daydreams hold copies. False when it was not the user's. */
export async function deleteLibraryItem(
	db: Db,
	userId: string,
	kind: LibraryKind,
	itemId: string
): Promise<boolean> {
	const table = libraryTable(kind);
	const rows = await db
		.delete(table)
		.where(and(eq(table.id, itemId), eq(table.ownerId, userId)))
		.returning({ id: table.id });
	return rows.length > 0;
}

/** A refusal as a status and words a person can act on, for the API and the forms alike. */
export function describeRefusal(reason: DaydreamRefusal): { status: number; message: string } {
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
			return assertNever(reason, 'refusal');
	}
}
