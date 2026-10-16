import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { assertNever } from '../assert-never';
import type { DaydreamTurnRole } from '../daydream';
import { daydreamSetupKind, daydreamTurnKind } from '../sealed-kinds/daydreams';
import type {
	DaydreamListItemView,
	DaydreamsWidgetView,
	DaydreamTurnView,
	DaydreamView
} from '../types';
import type { Db } from './db';
import { daydreamPreferences, daydreams, daydreamTurns } from './db/schema';
import { type SealedWrite, sealedIsAcceptable, selfVaultIdFor } from './sealed-content';

/**
 * Every database access for Daydreams. See docs/daydreams.md.
 *
 * Everything here is the owner's alone: there is no partner side to a
 * daydream, so every query is scoped to `ownerId`, and someone else's id
 * reads exactly like one that does not exist. The content is sealed; what the
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
	| 'not-latest';

export type DaydreamResult<T = object> =
	| ({ ok: true } & T)
	| { ok: false; reason: DaydreamRefusal };

/** The most turns a daydream page loads. Older ones stay stored; see `getDaydream`. */
export const MAX_LOADED_TURNS = 500;

async function contentProblem(
	db: Db,
	userId: string,
	kind: typeof daydreamSetupKind | typeof daydreamTurnKind,
	content: SealedWrite
): Promise<'bad-content' | 'wrong-vault' | null> {
	if (!sealedIsAcceptable(kind, content.ciphertext, content.payloadVersion)) {
		return 'bad-content';
	}
	return content.vaultId === (await selfVaultIdFor(db, userId)) ? null : 'wrong-vault';
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

/** Idempotent; a second acceptance keeps the first's time. */
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

/**
 * A daydream and its conversation, or null when it is not the user's.
 *
 * At most `MAX_LOADED_TURNS`, the newest, because D1 charges for rows read
 * and a long-running scene could otherwise make every visit cost thousands.
 * The model is only ever sent the newest turns anyway (`MAX_CONTEXT_CHARS`).
 */
export async function getDaydream(
	db: Db,
	userId: string,
	daydreamId: string
): Promise<DaydreamView | null> {
	const daydream = await getDaydreamSetup(db, userId, daydreamId);
	if (!daydream) {
		return null;
	}
	const turns = await db
		.select({
			id: daydreamTurns.id,
			role: daydreamTurns.role,
			position: daydreamTurns.position,
			revision: daydreamTurns.revision,
			ciphertext: daydreamTurns.ciphertext,
			vaultId: daydreamTurns.vaultId,
			payloadVersion: daydreamTurns.payloadVersion
		})
		.from(daydreamTurns)
		.where(eq(daydreamTurns.daydreamId, daydreamId))
		// Positions are unique per daydream, so `id` never decides; it is
		// there because ordering is always total here (AGENTS.md, invariant 8).
		.orderBy(desc(daydreamTurns.position), desc(daydreamTurns.id))
		.limit(MAX_LOADED_TURNS);
	return {
		...daydream,
		turns: turns.reverse().map(
			(turn): DaydreamTurnView => ({
				id: turn.id,
				role: turn.role,
				position: turn.position,
				revision: turn.revision,
				sealed: {
					recordId: turn.id,
					vaultId: turn.vaultId,
					ciphertext: turn.ciphertext,
					payloadVersion: turn.payloadVersion
				}
			})
		)
	};
}

/** A daydream's setup alone, for the edit page, which has no use for the conversation. */
export async function getDaydreamSetup(
	db: Db,
	userId: string,
	daydreamId: string
): Promise<Omit<DaydreamView, 'turns'> | null> {
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

/** Deletes a daydream and, by cascade, its turns. False when it was not the user's. */
export async function deleteDaydream(db: Db, userId: string, daydreamId: string): Promise<boolean> {
	const rows = await db
		.delete(daydreams)
		.where(and(eq(daydreams.id, daydreamId), eq(daydreams.ownerId, userId)))
		.returning({ id: daydreams.id });
	return rows.length > 0;
}

// ── turns ────────────────────────────────────────────────────────────────────

/**
 * Adds a turn at the end of the conversation.
 *
 * The position is worked out inside the insert, from the turns already
 * there, and the unique index on (daydream, position) refuses a second turn
 * taking the same place — two devices appending at once. That loser is told
 * `conflict` and reloads; it never silently lands out of order.
 */
export async function appendTurn(
	db: Db,
	userId: string,
	daydreamId: string,
	turn: { id: string; role: DaydreamTurnRole; content: SealedWrite },
	now = new Date()
): Promise<DaydreamResult<{ position: number; revision: number }>> {
	if (!(await ownsDaydream(db, userId, daydreamId))) {
		return { ok: false, reason: 'not-found' };
	}
	const problem = await contentProblem(db, userId, daydreamTurnKind, turn.content);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const next = sql<number>`(select coalesce(max(${daydreamTurns.position}), -1) + 1 from ${daydreamTurns} where ${daydreamTurns.daydreamId} = ${daydreamId})`;
	const [inserted] = await db
		.insert(daydreamTurns)
		.values({
			id: turn.id,
			daydreamId,
			role: turn.role,
			position: next,
			ciphertext: turn.content.ciphertext,
			vaultId: turn.content.vaultId,
			payloadVersion: turn.content.payloadVersion,
			createdAt: now,
			updatedAt: now
		})
		// No target: SQLite then skips a clash on any unique constraint, the id
		// or the position, and the check below says which it was.
		.onConflictDoNothing()
		.returning({ position: daydreamTurns.position, revision: daydreamTurns.revision });
	if (!inserted) {
		const [taken] = await db
			.select({ id: daydreamTurns.id })
			.from(daydreamTurns)
			.where(eq(daydreamTurns.id, turn.id))
			.limit(1);
		return { ok: false, reason: taken ? 'id-taken' : 'conflict' };
	}
	await db
		.update(daydreams)
		.set({ lastTurnAt: now })
		.where(and(eq(daydreams.id, daydreamId), eq(daydreams.ownerId, userId)));
	return { ok: true, position: inserted.position, revision: inserted.revision };
}

/**
 * Replaces the newest turn, when it is the character's: what "retry" does.
 *
 * Only the newest, so a retry can never rewrite history the rest of the
 * conversation followed from; only the character's, so it can never rewrite
 * what the user said. Compare-and-swap on `revision` as well, so two devices
 * retrying at once cannot both land.
 */
export async function replaceLatestCharacterTurn(
	db: Db,
	userId: string,
	daydreamId: string,
	input: { turnId: string; expectedRevision: number; content: SealedWrite },
	now = new Date()
): Promise<DaydreamResult<{ revision: number }>> {
	if (!(await ownsDaydream(db, userId, daydreamId))) {
		return { ok: false, reason: 'not-found' };
	}
	const problem = await contentProblem(db, userId, daydreamTurnKind, input.content);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const latest = sql`(select max(${daydreamTurns.position}) from ${daydreamTurns} where ${daydreamTurns.daydreamId} = ${daydreamId})`;
	const rows = await db
		.update(daydreamTurns)
		.set({
			ciphertext: input.content.ciphertext,
			vaultId: input.content.vaultId,
			payloadVersion: input.content.payloadVersion,
			revision: input.expectedRevision + 1,
			updatedAt: now
		})
		.where(
			and(
				eq(daydreamTurns.id, input.turnId),
				eq(daydreamTurns.daydreamId, daydreamId),
				eq(daydreamTurns.role, 'character'),
				eq(daydreamTurns.revision, input.expectedRevision),
				eq(daydreamTurns.position, latest)
			)
		)
		.returning({ revision: daydreamTurns.revision });
	const [updated] = rows;
	if (updated) {
		await db
			.update(daydreams)
			.set({ lastTurnAt: now })
			.where(and(eq(daydreams.id, daydreamId), eq(daydreams.ownerId, userId)));
		return { ok: true, revision: updated.revision };
	}
	const [existing] = await db
		.select({ role: daydreamTurns.role, revision: daydreamTurns.revision })
		.from(daydreamTurns)
		.where(and(eq(daydreamTurns.id, input.turnId), eq(daydreamTurns.daydreamId, daydreamId)))
		.limit(1);
	if (!existing) {
		return { ok: false, reason: 'not-found' };
	}
	return {
		ok: false,
		reason:
			existing.role === 'character' && existing.revision !== input.expectedRevision
				? 'conflict'
				: 'not-latest'
	};
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
					'This daydream changed somewhere else since you opened it. Reload to see the latest, then try again.'
			};
		case 'not-latest':
			return {
				status: 409,
				message: 'Only the newest reply can be retried. Reload to see the latest.'
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
