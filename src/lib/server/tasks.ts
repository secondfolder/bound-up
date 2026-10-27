import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { PartnerNamesSource } from '../partnership';
import { taskKind } from '../sealed-kinds/tasks';
import { assigneeFor, managesRecord, managesSpace, viewerActsIn } from '../spaces';
import {
	completionsInWindow,
	initialNextEligibleAt,
	nextEligibleAtAfterCompletion,
	scheduleReferenceDate,
	windowLowerBound
} from '../task-schedule';
import {
	canCompleteTask,
	isTaskCompletableAt,
	type SealedTaskContent,
	type TaskInput,
	taskListFor
} from '../tasks';
import type {
	BalanceView,
	ItemSpaceView,
	TaskCompletionView,
	TaskSchedule,
	TasksListView,
	TasksWidgetView,
	TaskTimeZoneNoteView,
	TaskView
} from '../types';
import type { Db } from './db';
import { rewardBalances, taskCompletions, tasks } from './db/schema';
import { sealedIsAcceptable, sealedRef, snapshotRef, vaultIdForSpace } from './sealed-content';
import { type ItemSpace, loadItemSpace, loadItemSpaces } from './spaces';

/**
 * Tasks: one code path for every space. See docs/tasks.md.
 *
 * A task is in a space — someone's own, or one shared by a partnership — and
 * every rule about it follows from the space's members and two columns: who
 * wrote it and who it is for (`assigneeUserId`). The rules themselves are
 * pure, in `src/lib/spaces.ts` and `src/lib/tasks.ts`; this is the reading
 * and writing around them.
 *
 * Every write names its task or its space and checks the viewer's membership
 * of it here; none reads the current context (docs/contexts.md, "Writes name
 * their space").
 */

/**
 * The key a space's task lists and cards `depends()` on, so a list and the
 * cards that preview it refresh together.
 */
export function tasksDependency(spaceId: string): `tasks:${string}` {
	return `tasks:${spaceId}`;
}

/** Who is asking: their id, and the time zone their own dates are in. */
export type Viewer = { id: string; timezone: string };

const taskColumns = {
	id: tasks.id,
	spaceId: tasks.spaceId,
	createdByUserId: tasks.createdByUserId,
	assigneeUserId: tasks.assigneeUserId,
	timezoneOwnerUserId: tasks.timezoneOwnerUserId,
	active: tasks.active,
	creditsAwarded: tasks.creditsAwarded,
	ciphertext: tasks.ciphertext,
	vaultId: tasks.vaultId,
	payloadVersion: tasks.payloadVersion,
	revision: tasks.revision,
	completionMessageCount: tasks.completionMessageCount,
	schedule: tasks.schedule,
	lastCompletedAt: tasks.lastCompletedAt,
	completedCount: tasks.completedCount,
	nextEligibleAt: tasks.nextEligibleAt,
	createdAt: tasks.createdAt,
	updatedAt: tasks.updatedAt
} as const;

const completionColumns = {
	id: taskCompletions.id,
	spaceId: taskCompletions.spaceId,
	completedByUserId: taskCompletions.completedByUserId,
	createdByUserId: taskCompletions.createdByUserId,
	creditsAwarded: taskCompletions.creditsAwarded,
	completionMessageIndex: taskCompletions.completionMessageIndex,
	snapshotCiphertext: taskCompletions.snapshotCiphertext,
	snapshotVaultId: taskCompletions.snapshotVaultId,
	snapshotVersion: taskCompletions.snapshotVersion,
	snapshotRecordId: taskCompletions.snapshotRecordId,
	createdAt: taskCompletions.createdAt
} as const;

type TaskRecord = {
	id: string;
	spaceId: string;
	createdByUserId: string;
	assigneeUserId: string | null;
	timezoneOwnerUserId: string;
	active: boolean;
	creditsAwarded: number;
	ciphertext: string;
	vaultId: string;
	payloadVersion: number;
	revision: number;
	completionMessageCount: number;
	schedule: TaskSchedule;
	lastCompletedAt: Date | null;
	completedCount: number;
	nextEligibleAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

type CompletionRecord = {
	id: string;
	spaceId: string;
	completedByUserId: string;
	createdByUserId: string;
	creditsAwarded: number;
	completionMessageIndex: number | null;
	snapshotCiphertext: string;
	snapshotVaultId: string;
	snapshotVersion: number;
	snapshotRecordId: string;
	createdAt: Date;
};

type TaskResult<TReason extends string> = { ok: true } | { ok: false; reason: TReason };

/** A completion that went through, with its id, which is what undoing it names. */
type CompleteTaskResult<TReason extends string> =
	| { ok: true; completionId: string }
	| { ok: false; reason: TReason };

type CreateTaskResult<TReason extends string> =
	| { ok: true; id: string }
	| { ok: false; reason: TReason };

/**
 * How long after completing a task it can still be undone. Long enough to
 * notice a mis-tap and come back to it; short enough that the credits are
 * unlikely to have gone anywhere and nobody has planned around the task
 * being done. See docs/tasks.md, "Undoing a completion".
 */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export type UndoRefusal =
	| 'not-found'
	| 'not-yours'
	| 'not-latest'
	| 'too-old'
	| 'not-undoable'
	| 'credits-spent';

/**
 * Why a sealed write was refused. `id-taken`: the browser chooses a new
 * record's id (it is part of what the content is sealed to), so a create can
 * name one that exists — a retried post whose first attempt landed, most
 * likely. Refused rather than left to fail as a primary-key error.
 */
export type ContentRefusal = 'bad-content' | 'wrong-vault' | 'id-taken';

/**
 * Whether a task's sealed content is one the server will store: a sealed
 * record of the task kind, under the vault of the task's space, with a
 * completion-message count it could have. The content itself it cannot see.
 */
function taskContentProblem(
	content: SealedTaskContent,
	vaultId: string | null
): ContentRefusal | null {
	if (
		!(
			sealedIsAcceptable(taskKind, content.ciphertext, content.payloadVersion) &&
			Number.isInteger(content.completionMessageCount)
		) ||
		content.completionMessageCount < 0 ||
		content.completionMessageCount > 20
	) {
		return 'bad-content';
	}
	return content.vaultId === vaultId ? null : 'wrong-vault';
}

/** The columns a sealed write sets, and `revision` moved on so a stale writer loses. */
function sealedTaskColumns(content: SealedTaskContent, revision: number) {
	return {
		ciphertext: content.ciphertext,
		vaultId: content.vaultId,
		payloadVersion: content.payloadVersion,
		completionMessageCount: content.completionMessageCount,
		revision
	};
}

/** The time zone a member's dates are in; the viewer's own for anyone not in the space. */
function timeZoneOf(space: ItemSpace, userId: string, viewer: Viewer): string {
	if (userId === viewer.id) {
		return viewer.timezone;
	}
	return space.members.find((member) => member.userId === userId)?.timezone ?? viewer.timezone;
}

function taskReferenceDate(
	schedule: TaskSchedule,
	row: Pick<TaskRecord, 'createdAt' | 'lastCompletedAt' | 'nextEligibleAt'>
): Date | null {
	if (row.nextEligibleAt) {
		return row.nextEligibleAt;
	}
	if (row.lastCompletedAt) {
		return row.lastCompletedAt;
	}
	if (schedule.mode !== 'scheduled' && schedule.mode !== 'one-off') {
		return row.createdAt;
	}
	return null;
}

function toTimeZoneNote(
	timeZone: string,
	referenceTimeZone: string,
	date: Date | null
): TaskTimeZoneNoteView | null {
	if (timeZone === referenceTimeZone || !date) {
		return null;
	}
	return { timeZone, referenceTimeZone, date, showCurrentTime: false };
}

function toTaskView(
	row: TaskRecord,
	space: ItemSpace,
	viewer: Viewer,
	windowCompletions: number | null = null,
	now: Date = new Date()
): TaskView {
	const ownerTimeZone = timeZoneOf(space, row.timezoneOwnerUserId, viewer);
	const noteDate =
		taskReferenceDate(row.schedule, row) ??
		(row.schedule.mode === 'one-off' ? null : scheduleReferenceDate(row.schedule, ownerTimeZone));
	return {
		id: row.id,
		spaceId: row.spaceId,
		active: row.active,
		creditsAwarded: row.creditsAwarded,
		sealed: sealedRef(row.id, row),
		revision: row.revision,
		schedule: row.schedule,
		timezoneOwnerUserId: row.timezoneOwnerUserId,
		lastCompletedAt: row.lastCompletedAt,
		completedCount: row.completedCount,
		nextEligibleAt: row.nextEligibleAt,
		windowCompletions,
		createdByMe: row.createdByUserId === viewer.id,
		assigneeUserId: row.assigneeUserId,
		canManage: managesRecord(row, space, viewer.id),
		canComplete: canCompleteTask(row, space, viewer.id, now),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		timeZoneNote: toTimeZoneNote(ownerTimeZone, viewer.timezone, noteDate)
	};
}

function toCompletionView(row: CompletionRecord, viewerId: string): TaskCompletionView {
	return {
		id: row.id,
		spaceId: row.spaceId,
		creditsAwarded: row.creditsAwarded,
		createdAt: row.createdAt,
		sealed: snapshotRef(row),
		completionMessageIndex: row.completionMessageIndex,
		mine: row.completedByUserId === viewerId,
		createdByMe: row.createdByUserId === viewerId
	};
}

/** A space as a tasks or rewards page needs it: where the viewer stands, and who else is there. */
export function toItemSpaceView(space: ItemSpace, viewerId: string): ItemSpaceView {
	return {
		id: space.id,
		kind: space.kind,
		canManage: managesSpace(space, viewerId),
		viewerActs: viewerActsIn(space, viewerId),
		others: space.members
			.filter((member) => member.userId !== viewerId)
			.map((member) => ({ userId: member.userId, timezone: member.timezone }))
	};
}

/**
 * The balances a space's tasks and rewards are about, for this viewer: their
 * own where they act, and each other member's they manage for. In the order
 * the spaces are given, the viewer's first within each.
 */
export function balancesFor(
	spaces: readonly ItemSpace[],
	viewerId: string,
	credits: { spaceId: string; userId: string; credits: number }[]
): BalanceView[] {
	const held = new Map(credits.map((row) => [`${row.spaceId}|${row.userId}`, row.credits]));
	return spaces.flatMap((space) => {
		const own: BalanceView[] = viewerActsIn(space, viewerId)
			? [
					{
						spaceId: space.id,
						userId: viewerId,
						mine: true,
						credits: held.get(`${space.id}|${viewerId}`) ?? 0,
						canSet: space.kind === 'solo'
					}
				]
			: [];
		const others: BalanceView[] =
			space.kind === 'shared' && managesSpace(space, viewerId)
				? space.members
						.filter((member) => member.userId !== viewerId && viewerActsIn(space, member.userId))
						.map((member) => ({
							spaceId: space.id,
							userId: member.userId,
							mine: false,
							credits: held.get(`${space.id}|${member.userId}`) ?? 0,
							canSet: true
						}))
				: [];
		return [...own, ...others];
	});
}

/** Every balance held in these spaces, in one query. */
export async function readBalances(
	db: Db,
	spaceIds: readonly string[]
): Promise<{ spaceId: string; userId: string; credits: number }[]> {
	if (spaceIds.length === 0) {
		return [];
	}
	return await db
		.select({
			spaceId: rewardBalances.spaceId,
			userId: rewardBalances.userId,
			credits: rewardBalances.credits
		})
		.from(rewardBalances)
		.where(inArray(rewardBalances.spaceId, [...spaceIds]));
}

/** One member's credits in one space. */
export async function readBalance(db: Db, spaceId: string, userId: string): Promise<number> {
	const [row] = await db
		.select({ credits: rewardBalances.credits })
		.from(rewardBalances)
		.where(and(eq(rewardBalances.spaceId, spaceId), eq(rewardBalances.userId, userId)))
		.limit(1);
	return row?.credits ?? 0;
}

async function recentCompletionTimes(db: Db, taskId: string, limit: number): Promise<Date[]> {
	if (limit <= 0) {
		return [];
	}
	const rows = await db
		.select({ createdAt: taskCompletions.createdAt })
		.from(taskCompletions)
		.where(eq(taskCompletions.taskId, taskId))
		.orderBy(desc(taskCompletions.createdAt), desc(taskCompletions.id))
		.limit(limit);
	return rows.map((row) => row.createdAt);
}

/** Under D1's 100 bound parameters per statement, leaving room for the date. */
const IN_CHUNK = 90;

function chunked<T>(values: T[]): T[][] {
	const chunks: T[][] = [];
	for (let at = 0; at < values.length; at += IN_CHUNK) {
		chunks.push(values.slice(at, at + IN_CHUNK));
	}
	return chunks;
}

/**
 * Completions inside each listed task's rolling window, for "1 left", each
 * window in its time zone owner's time. One query (per 90 tasks) for the whole
 * list rather than one per task, on the completions' task index, from the
 * earliest instant any of the windows could reach back to.
 */
async function countWindowCompletions(
	db: Db,
	rows: TaskRecord[],
	timeZoneFor: (row: TaskRecord) => string,
	now: Date = new Date()
): Promise<Map<string, number>> {
	const limited = rows.filter((row) => windowLowerBound(row.schedule, now) !== null);
	if (limited.length === 0) {
		return new Map();
	}
	const since = new Date(
		Math.min(...limited.map((row) => windowLowerBound(row.schedule, now)?.getTime() ?? 0))
	);
	const completions = (
		await Promise.all(
			chunked(limited.map((row) => row.id)).map((chunk) =>
				db
					.select({ taskId: taskCompletions.taskId, createdAt: taskCompletions.createdAt })
					.from(taskCompletions)
					.where(and(inArray(taskCompletions.taskId, chunk), gt(taskCompletions.createdAt, since)))
			)
		)
	).flat();
	const byTask = new Map<string, Date[]>();
	for (const completion of completions) {
		const list = byTask.get(completion.taskId) ?? [];
		list.push(completion.createdAt);
		byTask.set(completion.taskId, list);
	}
	const counts = new Map<string, number>();
	for (const row of limited) {
		const count = completionsInWindow(
			row.schedule,
			timeZoneFor(row),
			byTask.get(row.id) ?? [],
			now
		);
		if (count !== null) {
			counts.set(row.id, count);
		}
	}
	return counts;
}

/** The spaces of a context, in the order given, that the viewer is in. */
async function spacesInOrder(
	db: Db,
	viewerId: string,
	spaceIds: readonly string[]
): Promise<ItemSpace[]> {
	const found = await loadItemSpaces(db, viewerId, spaceIds);
	return spaceIds.flatMap((id) => {
		const space = found.get(id);
		return space ? [space] : [];
	});
}

/**
 * A tasks page's list for the spaces a context shows: what the viewer does
 * (**to do**), what they set for someone else (**set for others**), and the
 * balances both pay into. See docs/tasks.md, "To do and set for others".
 */
export async function listTasks(
	db: Db,
	viewer: Viewer,
	spaceIds: readonly string[],
	now: Date = new Date()
): Promise<TasksListView> {
	const spaces = await spacesInOrder(db, viewer.id, spaceIds);
	const ids = spaces.map((space) => space.id);
	if (ids.length === 0) {
		return { spaces: [], toDo: [], setForOthers: [], balances: [] };
	}
	const [rows, credits] = await Promise.all([
		db
			.select(taskColumns)
			.from(tasks)
			.where(inArray(tasks.spaceId, ids))
			.orderBy(desc(tasks.active), desc(tasks.createdAt), asc(tasks.id)),
		readBalances(db, ids)
	]);
	const bySpace = new Map(spaces.map((space) => [space.id, space]));
	const toDo: TaskRecord[] = [];
	const setForOthers: TaskRecord[] = [];
	for (const row of rows) {
		const space = bySpace.get(row.spaceId);
		const list = space ? taskListFor(row, space, viewer.id) : null;
		if (list === 'to-do') {
			toDo.push(row);
		} else if (list === 'set') {
			setForOthers.push(row);
		}
	}
	const spaceOf = (row: TaskRecord): ItemSpace => {
		const space = bySpace.get(row.spaceId);
		if (!space) {
			throw new Error('A listed task lost its space.');
		}
		return space;
	};
	const windows = await countWindowCompletions(
		db,
		[...toDo, ...setForOthers],
		(row) => timeZoneOf(spaceOf(row), row.timezoneOwnerUserId, viewer),
		now
	);
	const view = (row: TaskRecord) =>
		toTaskView(row, spaceOf(row), viewer, windows.get(row.id) ?? null, now);
	return {
		spaces: spaces.map((space) => toItemSpaceView(space, viewer.id)),
		toDo: toDo.map(view),
		setForOthers: setForOthers.map(view),
		balances: balancesFor(spaces, viewer.id, credits)
	};
}

/** Every completion in the spaces a context shows, newest first: the history sheet. */
export async function listTaskCompletions(
	db: Db,
	viewerId: string,
	spaceIds: readonly string[]
): Promise<TaskCompletionView[]> {
	const spaces = await spacesInOrder(db, viewerId, spaceIds);
	if (spaces.length === 0) {
		return [];
	}
	const rows = await db
		.select(completionColumns)
		.from(taskCompletions)
		.where(
			inArray(
				taskCompletions.spaceId,
				spaces.map((space) => space.id)
			)
		)
		.orderBy(desc(taskCompletions.createdAt), desc(taskCompletions.id));
	return rows.map((row) => toCompletionView(row, viewerId));
}

async function readTask(db: Db, taskId: string): Promise<TaskRecord | null> {
	const [row] = await db.select(taskColumns).from(tasks).where(eq(tasks.id, taskId)).limit(1);
	return row ?? null;
}

/** A task and its space, when the viewer is in that space; null otherwise, as for no task at all. */
async function taskInViewersSpace(
	db: Db,
	viewerId: string,
	taskId: string
): Promise<{ task: TaskRecord; space: ItemSpace } | null> {
	const task = await readTask(db, taskId);
	if (!task) {
		return null;
	}
	const space = await loadItemSpace(db, viewerId, task.spaceId);
	return space ? { task, space } : null;
}

/**
 * One task as the viewer sees it, with its space: what its edit sheet opens.
 * Its space is its own, never the context's (docs/contexts.md, "Items carry
 * their own space"). Null for a task that does not exist or is in a space the
 * viewer is not in, which the routes answer alike with a 404.
 */
export async function getTaskForViewer(
	db: Db,
	viewer: Viewer,
	taskId: string
): Promise<{ task: TaskView; space: ItemSpaceView } | null> {
	const found = await taskInViewersSpace(db, viewer.id, taskId);
	if (!found) {
		return null;
	}
	return {
		task: toTaskView(found.task, found.space, viewer),
		space: toItemSpaceView(found.space, viewer.id)
	};
}

/** Whose time a task's dates may be in: a member of its space. */
function timeZoneOwnerProblem(space: ItemSpace, timezoneOwnerUserId: string): boolean {
	return !space.members.some((member) => member.userId === timezoneOwnerUserId);
}

/**
 * Creates a task in the space the form names, set for the member
 * `assigneeFor` picks: the viewer in their own space, their partner in a
 * shared one. Only someone who manages the space may.
 *
 * `taskId` is chosen by the browser, because the content is sealed to it.
 */
export async function createTask(
	db: Db,
	viewer: Viewer,
	spaceId: string,
	taskId: string,
	input: TaskInput
): Promise<
	CreateTaskResult<
		'not-a-member' | 'forbidden' | 'no-assignee' | 'bad-timezone-owner' | ContentRefusal
	>
> {
	const space = await loadItemSpace(db, viewer.id, spaceId);
	if (!space) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!managesSpace(space, viewer.id)) {
		return { ok: false, reason: 'forbidden' };
	}
	const assigneeUserId = assigneeFor(space, viewer.id);
	if (!assigneeUserId) {
		return { ok: false, reason: 'no-assignee' };
	}
	// A solo task's dates are always its owner's.
	const timezoneOwnerUserId = space.kind === 'solo' ? viewer.id : input.timezoneOwnerUserId;
	if (timeZoneOwnerProblem(space, timezoneOwnerUserId)) {
		return { ok: false, reason: 'bad-timezone-owner' };
	}
	const problem = taskContentProblem(input.content, await vaultIdForSpace(db, space));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const now = new Date();
	const inserted = await db
		.insert(tasks)
		.values({
			id: taskId,
			spaceId,
			createdByUserId: viewer.id,
			assigneeUserId,
			timezoneOwnerUserId,
			...sealedTaskColumns(input.content, 0),
			active: input.active,
			creditsAwarded: input.creditsAwarded,
			schedule: input.schedule,
			nextEligibleAt: initialNextEligibleAt(
				input.schedule,
				timeZoneOf(space, timezoneOwnerUserId, viewer),
				now
			),
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing()
		.returning({ id: tasks.id });
	if (inserted.length === 0) {
		return { ok: false, reason: 'id-taken' };
	}
	return { ok: true, id: taskId };
}

/**
 * Replaces a task's settings and sealed content, for someone who may edit it
 * (`managesRecord`: their own task, or one they set for someone else).
 *
 * Compare-and-swap on `revision`: the write goes through only if the task is
 * still at the revision the editor opened. Anything else — the partner's edit,
 * another device's — makes this `conflict`, and the editor reloads rather than
 * overwriting what changed.
 */
export async function updateTask(
	db: Db,
	viewer: Viewer,
	taskId: string,
	input: TaskInput & { expectedRevision: number }
): Promise<
	TaskResult<'not-found' | 'forbidden' | 'bad-timezone-owner' | 'conflict' | ContentRefusal>
> {
	const found = await taskInViewersSpace(db, viewer.id, taskId);
	if (!found) {
		return { ok: false, reason: 'not-found' };
	}
	const { task, space } = found;
	if (!managesRecord(task, space, viewer.id)) {
		return { ok: false, reason: 'forbidden' };
	}
	const timezoneOwnerUserId = space.kind === 'solo' ? viewer.id : input.timezoneOwnerUserId;
	if (timeZoneOwnerProblem(space, timezoneOwnerUserId)) {
		return { ok: false, reason: 'bad-timezone-owner' };
	}
	const problem = taskContentProblem(input.content, await vaultIdForSpace(db, space));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const rows = await db
		.update(tasks)
		.set({
			timezoneOwnerUserId,
			...sealedTaskColumns(input.content, input.expectedRevision + 1),
			active: input.active,
			creditsAwarded: input.creditsAwarded,
			schedule: input.schedule,
			nextEligibleAt: initialNextEligibleAt(
				input.schedule,
				timeZoneOf(space, timezoneOwnerUserId, viewer)
			),
			updatedAt: new Date()
		})
		.where(and(eq(tasks.id, taskId), eq(tasks.revision, input.expectedRevision)))
		.returning({ id: tasks.id });
	return rows.length > 0 ? { ok: true } : { ok: false, reason: 'conflict' };
}

/**
 * Replaces a task's sealed content and nothing else, under the same
 * permission as editing it.
 *
 * What ticking a to-do item in a task's description saves (docs/rich-text.md,
 * "To-do lists"). Not `updateTask` with the settings posted back: that works
 * the schedule out again, so a task done today would be due again the moment
 * a box in its description was ticked. Compare-and-swap on `revision` all the
 * same.
 */
export async function updateTaskContent(
	db: Db,
	viewer: Viewer,
	taskId: string,
	input: { content: SealedTaskContent; expectedRevision: number }
): Promise<TaskResult<'not-found' | 'forbidden' | 'conflict' | ContentRefusal>> {
	const found = await taskInViewersSpace(db, viewer.id, taskId);
	if (!found) {
		return { ok: false, reason: 'not-found' };
	}
	if (!managesRecord(found.task, found.space, viewer.id)) {
		return { ok: false, reason: 'forbidden' };
	}
	const problem = taskContentProblem(input.content, await vaultIdForSpace(db, found.space));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const rows = await db
		.update(tasks)
		.set({
			...sealedTaskColumns(input.content, input.expectedRevision + 1),
			updatedAt: new Date()
		})
		.where(and(eq(tasks.id, taskId), eq(tasks.revision, input.expectedRevision)))
		.returning({ id: tasks.id });
	return rows.length > 0 ? { ok: true } : { ok: false, reason: 'conflict' };
}

/** One of `count` completion messages, at random, or null when there are none. */
function chooseCompletionIndex(count: number): number | null {
	return count > 0 ? Math.floor(Math.random() * count) : null;
}

/** The task as it is before a completion changes it, stored on the completion for undo. */
function undoStateOf(task: Pick<TaskRecord, 'active' | 'nextEligibleAt' | 'lastCompletedAt'>) {
	return {
		previousActive: task.active,
		previousNextEligibleAt: task.nextEligibleAt,
		previousLastCompletedAt: task.lastCompletedAt
	};
}

/**
 * Completes a task for the person it is set for, crediting their balance in
 * the task's space. Refused for anyone else (`actsOn`): someone the task is
 * not for, someone on the side that only sets tasks, and — whatever the
 * members' `can_manage` says — the person who wrote it.
 *
 * The task's sealed record is copied onto the completion as it is (the person
 * completing need not be its author and cannot re-seal it), with which of its
 * messages was picked, and with the task's state before, for undo.
 */
export async function completeTask(
	db: Db,
	viewer: Viewer,
	taskId: string,
	now: Date = new Date()
): Promise<CompleteTaskResult<'not-found' | 'not-allowed' | 'inactive' | 'not-ready'>> {
	const found = await taskInViewersSpace(db, viewer.id, taskId);
	if (!found) {
		return { ok: false, reason: 'not-found' };
	}
	const { task, space } = found;
	if (taskListFor(task, space, viewer.id) !== 'to-do') {
		return { ok: false, reason: 'not-allowed' };
	}
	if (!task.active) {
		return { ok: false, reason: 'inactive' };
	}
	if (!isTaskCompletableAt(task, now)) {
		return { ok: false, reason: 'not-ready' };
	}

	const recentCompletions =
		task.schedule.mode === 'rolling-window' && task.schedule.limit
			? await recentCompletionTimes(db, task.id, Math.max(task.schedule.limit.completions - 1, 0))
			: [];
	const nextEligibleAt = nextEligibleAtAfterCompletion(
		task.schedule,
		timeZoneOf(space, task.timezoneOwnerUserId, viewer),
		now,
		recentCompletions
	);
	const completionId = crypto.randomUUID();

	await db.batch([
		db.insert(taskCompletions).values({
			id: completionId,
			spaceId: task.spaceId,
			taskId: task.id,
			completedByUserId: viewer.id,
			createdByUserId: task.createdByUserId,
			snapshotCiphertext: task.ciphertext,
			snapshotVaultId: task.vaultId,
			snapshotVersion: task.payloadVersion,
			snapshotRecordId: task.id,
			completionMessageIndex: chooseCompletionIndex(task.completionMessageCount),
			...undoStateOf(task),
			creditsAwarded: task.creditsAwarded,
			createdAt: now,
			updatedAt: now
		}),
		db
			.update(tasks)
			.set({
				active: task.schedule.mode === 'one-off' ? false : task.active,
				lastCompletedAt: now,
				// In SQL, as the credits are: two completions at once must count twice.
				completedCount: sql`${tasks.completedCount} + 1`,
				nextEligibleAt,
				updatedAt: now
			})
			.where(eq(tasks.id, task.id)),
		db
			.insert(rewardBalances)
			.values({
				spaceId: task.spaceId,
				userId: viewer.id,
				credits: task.creditsAwarded,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [rewardBalances.spaceId, rewardBalances.userId],
				// Added in SQL, not read and written back: two completions at once
				// used to lose one award between the read and the write.
				set: { credits: sql`${rewardBalances.credits} + ${task.creditsAwarded}`, updatedAt: now }
			})
	]);

	return { ok: true, completionId };
}

/** What the person undoing is told when it is refused, by reason. */
export const UNDO_REFUSALS: Record<UndoRefusal, string> = {
	'not-found': 'That completion is no longer there to undo.',
	'not-yours': 'That completion is no longer there to undo.',
	'not-latest': 'Only the most recent completion of a task can be undone.',
	'too-old': 'It is too late to undo that completion.',
	'not-undoable': 'That completion was recorded before completions could be undone.',
	'credits-spent': 'Those credits have already been spent, so it cannot be undone.'
};

/**
 * Whether a completion may be undone, and if not why (docs/tasks.md, "Undoing
 * a completion"): only the newest completion of its task, only within
 * `UNDO_WINDOW_MS`, only one recorded with the task's previous state, and only
 * while the credits it gave are unspent.
 */
function undoRefusal(
	completion: { createdAt: Date; previousActive: boolean | null; creditsAwarded: number },
	latestId: string | undefined,
	completionId: string,
	credits: number,
	now: Date
): UndoRefusal | null {
	if (latestId !== completionId) {
		return 'not-latest';
	}
	if (now.getTime() - completion.createdAt.getTime() > UNDO_WINDOW_MS) {
		return 'too-old';
	}
	if (completion.previousActive === null) {
		return 'not-undoable';
	}
	if (credits < completion.creditsAwarded) {
		return 'credits-spent';
	}
	return null;
}

/**
 * Takes back a completion: it goes, the task returns to the state it recorded,
 * and the credits it gave come back out of the balance. One batch, so none of
 * it happens without the rest. Only the person who completed it may, and only
 * while the task is still theirs to do: it is their credits that come back.
 */
export async function undoTaskCompletion(
	db: Db,
	viewer: Viewer,
	completionId: string,
	now: Date = new Date()
): Promise<TaskResult<UndoRefusal>> {
	const [completion] = await db
		.select({
			taskId: taskCompletions.taskId,
			spaceId: taskCompletions.spaceId,
			completedByUserId: taskCompletions.completedByUserId,
			creditsAwarded: taskCompletions.creditsAwarded,
			createdAt: taskCompletions.createdAt,
			previousActive: taskCompletions.previousActive,
			previousNextEligibleAt: taskCompletions.previousNextEligibleAt,
			previousLastCompletedAt: taskCompletions.previousLastCompletedAt
		})
		.from(taskCompletions)
		.where(eq(taskCompletions.id, completionId))
		.limit(1);
	if (!completion) {
		return { ok: false, reason: 'not-found' };
	}
	const found = await taskInViewersSpace(db, viewer.id, completion.taskId);
	if (!found) {
		return { ok: false, reason: 'not-found' };
	}
	if (
		completion.completedByUserId !== viewer.id ||
		taskListFor(found.task, found.space, viewer.id) !== 'to-do'
	) {
		return { ok: false, reason: 'not-yours' };
	}
	const [latest] = await db
		.select({ id: taskCompletions.id })
		.from(taskCompletions)
		.where(eq(taskCompletions.taskId, completion.taskId))
		.orderBy(desc(taskCompletions.createdAt), desc(taskCompletions.id))
		.limit(1);
	const refusal = undoRefusal(
		completion,
		latest?.id,
		completionId,
		await readBalance(db, completion.spaceId, viewer.id),
		now
	);
	if (refusal) {
		return { ok: false, reason: refusal };
	}

	await db.batch([
		db.delete(taskCompletions).where(eq(taskCompletions.id, completionId)),
		db
			.update(tasks)
			.set({
				active: completion.previousActive ?? true,
				nextEligibleAt: completion.previousNextEligibleAt,
				lastCompletedAt: completion.previousLastCompletedAt,
				completedCount: sql`max(${tasks.completedCount} - 1, 0)`,
				updatedAt: now
			})
			.where(eq(tasks.id, completion.taskId)),
		db
			.update(rewardBalances)
			.set({
				credits: sql`max(${rewardBalances.credits} - ${completion.creditsAwarded}, 0)`,
				updatedAt: now
			})
			.where(
				and(eq(rewardBalances.spaceId, completion.spaceId), eq(rewardBalances.userId, viewer.id))
			)
	]);
	return { ok: true };
}

/**
 * How many rows a section widget's body lists before it stops and counts.
 *
 * Three fits a phone under the other cards; the card's own header link is the
 * way to see the rest, so a longer list would just push the next card down.
 */
const WIDGET_PREVIEW_LIMIT = 3;

/**
 * The tasks card, for the spaces it covers: every space the viewer is in on
 * /home, one partnership's on its page. The same split as the tasks page, so
 * the card previews what the link shows: the viewer's to-do list where they
 * have one, and otherwise a count of what they set for others.
 *
 * Active rows only, and only the columns the card reads — deliberately not
 * `listTasks`, which also counts every rolling window. D1 charges for rows
 * read. `names` labels a shared space's rows with whose they are.
 */
export async function getTasksWidget(
	db: Db,
	viewerId: string,
	spaceIds: readonly string[],
	names: ReadonlyMap<string, PartnerNamesSource>,
	now: Date = new Date()
): Promise<TasksWidgetView> {
	const spaces = await spacesInOrder(db, viewerId, spaceIds);
	const empty = { viewerActs: true, ready: [], readyCount: 0, waitingCount: 0, activeCount: 0 };
	if (spaces.length === 0) {
		return empty;
	}
	const rows = await db
		.select({
			id: tasks.id,
			spaceId: tasks.spaceId,
			createdByUserId: tasks.createdByUserId,
			assigneeUserId: tasks.assigneeUserId,
			ciphertext: tasks.ciphertext,
			vaultId: tasks.vaultId,
			payloadVersion: tasks.payloadVersion,
			active: tasks.active,
			creditsAwarded: tasks.creditsAwarded,
			nextEligibleAt: tasks.nextEligibleAt
		})
		.from(tasks)
		.where(
			and(
				inArray(
					tasks.spaceId,
					spaces.map((space) => space.id)
				),
				eq(tasks.active, true)
			)
		);
	const bySpace = new Map(spaces.map((space) => [space.id, space]));
	const listOf = (row: (typeof rows)[number]) => {
		const space = bySpace.get(row.spaceId);
		return space ? taskListFor(row, space, viewerId) : null;
	};
	const viewerActs = spaces.some((space) => viewerActsIn(space, viewerId));
	if (!viewerActs) {
		// The side that only sets tasks never sees a "ready" list — it is
		// somebody else's to-do list — so the card counts what they set, and the
		// titles are not serialised into the page for nothing.
		return {
			...empty,
			viewerActs: false,
			activeCount: rows.filter((row) => listOf(row) === 'set').length
		};
	}
	// Sorted across every space rather than per space, so the three rows the
	// card shows are the three most overdue. No `nextEligibleAt` means always
	// ready, which belongs at the top.
	const toDo = rows
		.filter((row) => listOf(row) === 'to-do')
		.sort(
			(a, b) =>
				(a.nextEligibleAt?.getTime() ?? Number.NEGATIVE_INFINITY) -
				(b.nextEligibleAt?.getTime() ?? Number.NEGATIVE_INFINITY)
		);
	const ready = toDo.filter((row) => isTaskCompletableAt(row, now));
	return {
		viewerActs: true,
		ready: ready.slice(0, WIDGET_PREVIEW_LIMIT).map((row) => ({
			id: row.id,
			// Only a guide's title is shown as it is; a task's is sealed.
			title: '',
			kind: 'task' as const,
			sealed: sealedRef(row.id, row),
			note: row.creditsAwarded > 0 ? `+${row.creditsAwarded}` : null,
			// Whose, on a card covering several spaces; nothing for one.
			context: spaces.length > 1 ? (names.get(row.spaceId) ?? null) : null
		})),
		readyCount: ready.length,
		waitingCount: toDo.length - ready.length,
		activeCount: toDo.length
	};
}
