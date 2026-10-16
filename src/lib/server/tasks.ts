import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { taskKind } from '../sealed-kinds/tasks';
import {
	initialNextEligibleAt,
	nextEligibleAtAfterCompletion,
	scheduleReferenceDate
} from '../task-schedule';
import {
	canCompleteFromPartnership,
	canViewPartnershipTask,
	isTaskCompletableAt,
	type SealedTaskContent,
	type TaskInput
} from '../tasks';
import type {
	HomePartnerTasksSectionView,
	PartnershipTaskCompletionView,
	PartnershipTaskView,
	PartnerView,
	SelfTasksSectionView,
	SelfTaskView,
	TaskCompletionView,
	TaskSchedule,
	TasksWidgetView,
	TaskTimeZoneNoteView
} from '../types';
import type { Db } from './db';
import {
	partnershipRewardCredits,
	partnerships,
	partnershipTaskCompletions,
	partnershipTasks,
	selfRewardCredits,
	selfTaskCompletions,
	selfTasks
} from './db/schema';
import { getPartnershipForUser } from './partnerships';
import {
	partnershipVaultIdFor,
	sealedIsAcceptable,
	sealedRef,
	selfVaultIdFor,
	snapshotRef
} from './sealed-content';

const selfTaskColumns = {
	id: selfTasks.id,
	ownerId: selfTasks.ownerId,
	title: selfTasks.title,
	description: selfTasks.description,
	active: selfTasks.active,
	creditsAwarded: selfTasks.creditsAwarded,
	completionMessages: selfTasks.completionMessages,
	ciphertext: selfTasks.ciphertext,
	vaultId: selfTasks.vaultId,
	payloadVersion: selfTasks.payloadVersion,
	revision: selfTasks.revision,
	completionMessageCount: selfTasks.completionMessageCount,
	schedule: selfTasks.schedule,
	timezoneOwnerUserId: selfTasks.timezoneOwnerUserId,
	lastCompletedAt: selfTasks.lastCompletedAt,
	completedCount: selfTasks.completedCount,
	nextEligibleAt: selfTasks.nextEligibleAt,
	createdAt: selfTasks.createdAt,
	updatedAt: selfTasks.updatedAt
} as const;

const partnershipTaskColumns = {
	id: partnershipTasks.id,
	partnershipId: partnershipTasks.partnershipId,
	createdByUserId: partnershipTasks.createdByUserId,
	timezoneOwnerUserId: partnershipTasks.timezoneOwnerUserId,
	title: partnershipTasks.title,
	description: partnershipTasks.description,
	active: partnershipTasks.active,
	creditsAwarded: partnershipTasks.creditsAwarded,
	completionMessages: partnershipTasks.completionMessages,
	ciphertext: partnershipTasks.ciphertext,
	vaultId: partnershipTasks.vaultId,
	payloadVersion: partnershipTasks.payloadVersion,
	revision: partnershipTasks.revision,
	completionMessageCount: partnershipTasks.completionMessageCount,
	schedule: partnershipTasks.schedule,
	lastCompletedAt: partnershipTasks.lastCompletedAt,
	completedCount: partnershipTasks.completedCount,
	nextEligibleAt: partnershipTasks.nextEligibleAt,
	createdAt: partnershipTasks.createdAt,
	updatedAt: partnershipTasks.updatedAt
} as const;

const selfTaskCompletionColumns = {
	id: selfTaskCompletions.id,
	taskTitle: selfTaskCompletions.taskTitle,
	taskDescription: selfTaskCompletions.taskDescription,
	creditsAwarded: selfTaskCompletions.creditsAwarded,
	completionMessage: selfTaskCompletions.completionMessage,
	completionMessageIndex: selfTaskCompletions.completionMessageIndex,
	snapshotCiphertext: selfTaskCompletions.snapshotCiphertext,
	snapshotVaultId: selfTaskCompletions.snapshotVaultId,
	snapshotVersion: selfTaskCompletions.snapshotVersion,
	snapshotRecordId: selfTaskCompletions.snapshotRecordId,
	createdAt: selfTaskCompletions.createdAt
} as const;

const partnershipTaskCompletionColumns = {
	id: partnershipTaskCompletions.id,
	completedByUserId: partnershipTaskCompletions.completedByUserId,
	createdByUserId: partnershipTaskCompletions.createdByUserId,
	taskTitle: partnershipTaskCompletions.taskTitle,
	taskDescription: partnershipTaskCompletions.taskDescription,
	creditsAwarded: partnershipTaskCompletions.creditsAwarded,
	completionMessage: partnershipTaskCompletions.completionMessage,
	completionMessageIndex: partnershipTaskCompletions.completionMessageIndex,
	snapshotCiphertext: partnershipTaskCompletions.snapshotCiphertext,
	snapshotVaultId: partnershipTaskCompletions.snapshotVaultId,
	snapshotVersion: partnershipTaskCompletions.snapshotVersion,
	snapshotRecordId: partnershipTaskCompletions.snapshotRecordId,
	createdAt: partnershipTaskCompletions.createdAt
} as const;

type SelfTaskRow = {
	id: string;
	ownerId: string;
	title: string | null;
	description: string | null;
	active: boolean;
	creditsAwarded: number;
	completionMessages: string[] | null;
	ciphertext: string | null;
	vaultId: string | null;
	payloadVersion: number | null;
	revision: number;
	completionMessageCount: number;
	schedule: TaskSchedule;
	timezoneOwnerUserId: string;
	lastCompletedAt: Date | null;
	completedCount: number;
	nextEligibleAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

type PartnershipTaskRow = {
	id: string;
	partnershipId: string;
	createdByUserId: string;
	timezoneOwnerUserId: string;
	title: string | null;
	description: string | null;
	active: boolean;
	creditsAwarded: number;
	completionMessages: string[] | null;
	ciphertext: string | null;
	vaultId: string | null;
	payloadVersion: number | null;
	revision: number;
	completionMessageCount: number;
	schedule: TaskSchedule;
	lastCompletedAt: Date | null;
	completedCount: number;
	nextEligibleAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

type SelfTaskCompletionRow = {
	id: string;
	taskTitle: string | null;
	taskDescription: string | null;
	creditsAwarded: number;
	completionMessage: string | null;
	completionMessageIndex: number | null;
	snapshotCiphertext: string | null;
	snapshotVaultId: string | null;
	snapshotVersion: number | null;
	snapshotRecordId: string | null;
	createdAt: Date;
};

type PartnershipTaskCompletionRow = SelfTaskCompletionRow & {
	completedByUserId: string;
	createdByUserId: string;
};

type TaskMembership = {
	partnership: NonNullable<Awaited<ReturnType<typeof getPartnershipForUser>>>;
	viewerId: string;
	viewerTimezone: string;
	canManage: boolean;
	canComplete: boolean;
	counterpartUserId: string;
	counterpartTimezone: string;
};

export type PartnershipTasksPageView = {
	partner: {
		id: string;
		name: string;
		canManageTasks: boolean;
		canCompleteTasks: boolean;
		counterpartUserId: string;
		counterpartTimezone: string;
	};
	tasks: PartnershipTaskView[];
	completions: PartnershipTaskCompletionView[];
};

type TaskResult<TReason extends string> = { ok: true } | { ok: false; reason: TReason };

/** Why the server refused the sealed half of a task write. */
/**
 * Why a sealed write was refused. `id-taken`: the browser chooses a new
 * record's id (it is part of what the content is sealed to), so a create can
 * name one that exists — a retried post whose first attempt landed, most
 * likely. Refused rather than left to fail as a primary-key error.
 */
type ContentRefusal = 'bad-content' | 'wrong-vault' | 'id-taken';

/**
 * Whether a task's sealed content is one the server will store: a sealed
 * record of the task kind, under the vault this task belongs in, with a
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
		revision,
		// Never both: once the content is sealed, the plaintext goes.
		title: null,
		description: null,
		completionMessages: null
	};
}
type CreateTaskResult<TReason extends string> =
	| { ok: true; id: string }
	| { ok: false; reason: TReason };

function canCompleteFromPartnershipView(partnership: TaskMembership['partnership']): boolean {
	return partnership.control === 'both' || !partnership.canEdit;
}

function taskReferenceDate(
	schedule: TaskSchedule,
	row: Pick<SelfTaskRow, 'createdAt' | 'lastCompletedAt' | 'nextEligibleAt'>
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
	timeZone: string | null,
	referenceTimeZone: string,
	date: Date | null,
	showCurrentTime = false
): TaskTimeZoneNoteView | null {
	if (!timeZone || timeZone === referenceTimeZone || !date) {
		return null;
	}
	return { timeZone, referenceTimeZone, date, showCurrentTime };
}

function toTaskCompletionView(row: SelfTaskCompletionRow): TaskCompletionView {
	return {
		id: row.id,
		taskTitle: row.taskTitle ?? '',
		taskDescription: row.taskDescription,
		creditsAwarded: row.creditsAwarded,
		completionMessage: row.completionMessage,
		createdAt: row.createdAt,
		sealed: snapshotRef(row),
		completionMessageIndex: row.completionMessageIndex
	};
}

function resolveTimeZoneForSelfTask(
	row: Pick<SelfTaskRow, 'timezoneOwnerUserId'>,
	viewerId: string,
	viewerTimezone: string
): string | null {
	return row.timezoneOwnerUserId === viewerId ? viewerTimezone : null;
}

function resolveTimeZoneForPartnershipTask(
	row: Pick<PartnershipTaskRow, 'timezoneOwnerUserId'>,
	membership: TaskMembership
): string | null {
	if (row.timezoneOwnerUserId === membership.viewerId) {
		return membership.viewerTimezone;
	}
	if (row.timezoneOwnerUserId === membership.counterpartUserId) {
		return membership.counterpartTimezone;
	}
	return null;
}

function toSelfTaskView(row: SelfTaskRow, viewerTimezone: string): SelfTaskView {
	const noteDate =
		taskReferenceDate(row.schedule, row) ??
		(row.schedule.mode === 'one-off' ? null : scheduleReferenceDate(row.schedule, viewerTimezone));
	return {
		id: row.id,
		title: row.title ?? '',
		description: row.description,
		active: row.active,
		creditsAwarded: row.creditsAwarded,
		completionMessages: row.completionMessages ?? [],
		sealed: sealedRef(row.id, row),
		revision: row.revision,
		schedule: row.schedule,
		timezoneOwnerUserId: row.timezoneOwnerUserId,
		lastCompletedAt: row.lastCompletedAt,
		completedCount: row.completedCount,
		nextEligibleAt: row.nextEligibleAt,
		canComplete: isTaskCompletableAt(row),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		timeZoneNote: toTimeZoneNote(
			resolveTimeZoneForSelfTask(row, row.ownerId, viewerTimezone),
			viewerTimezone,
			noteDate
		)
	};
}

function toPartnershipTaskView(
	row: PartnershipTaskRow,
	membership: TaskMembership
): PartnershipTaskView {
	const ownerTimeZone =
		resolveTimeZoneForPartnershipTask(row, membership) ?? membership.viewerTimezone;
	const noteDate =
		taskReferenceDate(row.schedule, row) ??
		(row.schedule.mode === 'one-off' ? null : scheduleReferenceDate(row.schedule, ownerTimeZone));
	const createdByMe = row.createdByUserId === membership.viewerId;
	return {
		id: row.id,
		title: row.title ?? '',
		description: row.description,
		active: row.active,
		creditsAwarded: row.creditsAwarded,
		completionMessages: row.completionMessages ?? [],
		sealed: sealedRef(row.id, row),
		revision: row.revision,
		schedule: row.schedule,
		timezoneOwnerUserId: row.timezoneOwnerUserId,
		lastCompletedAt: row.lastCompletedAt,
		completedCount: row.completedCount,
		nextEligibleAt: row.nextEligibleAt,
		createdByMe,
		canManage: membership.canManage,
		canComplete: membership.canComplete && !createdByMe && isTaskCompletableAt(row),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		timeZoneNote: toTimeZoneNote(
			resolveTimeZoneForPartnershipTask(row, membership),
			membership.viewerTimezone,
			noteDate
		)
	};
}

async function readSelfRewardCredits(db: Db, userId: string): Promise<number> {
	const rows = await db
		.select({ credits: selfRewardCredits.credits })
		.from(selfRewardCredits)
		.where(eq(selfRewardCredits.ownerId, userId))
		.limit(1);
	return rows[0]?.credits ?? 0;
}

async function readPartnershipRewardCredits(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<number> {
	const rows = await db
		.select({ credits: partnershipRewardCredits.credits })
		.from(partnershipRewardCredits)
		.where(
			and(
				eq(partnershipRewardCredits.partnershipId, partnershipId),
				eq(partnershipRewardCredits.userId, userId)
			)
		)
		.limit(1);
	return rows[0]?.credits ?? 0;
}

async function recentSelfTaskCompletionTimes(
	db: Db,
	taskId: string,
	limit: number
): Promise<Date[]> {
	if (limit <= 0) {
		return [];
	}
	const rows = await db
		.select({ createdAt: selfTaskCompletions.createdAt })
		.from(selfTaskCompletions)
		.where(eq(selfTaskCompletions.taskId, taskId))
		.orderBy(desc(selfTaskCompletions.createdAt), desc(selfTaskCompletions.id))
		.limit(limit);
	return rows.map((row) => row.createdAt);
}

async function recentPartnershipTaskCompletionTimes(
	db: Db,
	taskId: string,
	limit: number
): Promise<Date[]> {
	if (limit <= 0) {
		return [];
	}
	const rows = await db
		.select({ createdAt: partnershipTaskCompletions.createdAt })
		.from(partnershipTaskCompletions)
		.where(eq(partnershipTaskCompletions.taskId, taskId))
		.orderBy(desc(partnershipTaskCompletions.createdAt), desc(partnershipTaskCompletions.id))
		.limit(limit);
	return rows.map((row) => row.createdAt);
}

/** One of `count` completion messages, at random, or null when there are none. */
function chooseCompletionIndex(count: number): number | null {
	return count > 0 ? Math.floor(Math.random() * count) : null;
}

/**
 * What a completion records of the task, as it is now.
 *
 * A sealed task's record is copied as it is — the person completing need not
 * be its author and cannot re-seal it — with which of its messages was picked.
 * A task still in plaintext is snapshotted in plaintext, as before sealing.
 */
function completionSnapshot(task: SelfTaskRow | PartnershipTaskRow) {
	const sealed = sealedRef(task.id, task);
	if (sealed) {
		return {
			snapshotCiphertext: sealed.ciphertext,
			snapshotVaultId: sealed.vaultId,
			snapshotVersion: sealed.payloadVersion,
			snapshotRecordId: sealed.recordId,
			completionMessageIndex: chooseCompletionIndex(task.completionMessageCount),
			taskTitle: null,
			taskDescription: null,
			completionMessage: null
		};
	}
	const messages = task.completionMessages ?? [];
	const index = chooseCompletionIndex(messages.length);
	return {
		taskTitle: task.title ?? '',
		taskDescription: task.description,
		completionMessage: index === null ? null : (messages[index] ?? null)
	};
}

function toPartnershipTaskCompletionView(
	row: PartnershipTaskCompletionRow,
	viewerId: string
): PartnershipTaskCompletionView {
	return {
		...toTaskCompletionView(row),
		mine: row.completedByUserId === viewerId,
		createdByMe: row.createdByUserId === viewerId
	};
}

export async function requireTaskMembership(
	db: Db,
	partnershipId: string,
	userId: string,
	viewerTimezone: string
): Promise<TaskMembership | null> {
	const partnership = await getPartnershipForUser(db, partnershipId, userId);
	if (partnership?.status !== 'accepted' || !partnership.counterpart?.userId) {
		return null;
	}
	return {
		partnership,
		viewerId: userId,
		viewerTimezone,
		canManage: partnership.canEdit,
		canComplete: canCompleteFromPartnershipView(partnership),
		counterpartUserId: partnership.counterpart.userId,
		counterpartTimezone: partnership.counterpart.timezone
	};
}

export async function getSelfTasksSection(
	db: Db,
	userId: string,
	viewerTimezone: string
): Promise<SelfTasksSectionView> {
	const [tasks, completions] = await Promise.all([
		db
			.select(selfTaskColumns)
			.from(selfTasks)
			.where(eq(selfTasks.ownerId, userId))
			.orderBy(desc(selfTasks.active), desc(selfTasks.createdAt), asc(selfTasks.id)),
		db
			.select(selfTaskCompletionColumns)
			.from(selfTaskCompletions)
			.where(eq(selfTaskCompletions.ownerId, userId))
			.orderBy(desc(selfTaskCompletions.createdAt), desc(selfTaskCompletions.id))
	]);

	return {
		tasks: tasks.map((row) => toSelfTaskView(row, viewerTimezone)),
		completions: completions.map(toTaskCompletionView)
	};
}

/**
 * Creates a self task, its content sealed in the owner's own vault.
 *
 * `taskId` is chosen by the browser, because the content is sealed to it.
 */
export async function createSelfTask(
	db: Db,
	userId: string,
	ownerTimeZone: string,
	taskId: string,
	input: TaskInput
): Promise<CreateTaskResult<ContentRefusal>> {
	const problem = taskContentProblem(input.content, await selfVaultIdFor(db, userId));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const now = new Date();
	const inserted = await db
		.insert(selfTasks)
		.values({
			id: taskId,
			ownerId: userId,
			...sealedTaskColumns(input.content, 0),
			active: input.active,
			creditsAwarded: input.creditsAwarded,
			schedule: input.schedule,
			timezoneOwnerUserId: userId,
			nextEligibleAt: initialNextEligibleAt(input.schedule, ownerTimeZone, now),
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing()
		.returning({ id: selfTasks.id });
	if (inserted.length === 0) {
		return { ok: false, reason: 'id-taken' };
	}
	return { ok: true, id: taskId };
}

export async function getSelfTaskForUser(
	db: Db,
	userId: string,
	viewerTimezone: string,
	taskId: string
): Promise<SelfTaskView | null> {
	const rows = await db
		.select(selfTaskColumns)
		.from(selfTasks)
		.where(and(eq(selfTasks.id, taskId), eq(selfTasks.ownerId, userId)))
		.limit(1);
	const [row] = rows;
	if (!row) {
		return null;
	}
	return toSelfTaskView(row, viewerTimezone);
}

/**
 * Replaces a self task's settings and sealed content.
 *
 * Compare-and-swap on `revision`: the write goes through only if the task is
 * still at the revision the editor opened. Anything else — another device's
 * edit, a background upgrade — makes this `conflict`, and the editor reloads
 * rather than overwriting what changed.
 */
export async function updateSelfTask(
	db: Db,
	userId: string,
	ownerTimeZone: string,
	taskId: string,
	input: TaskInput & { expectedRevision: number }
): Promise<TaskResult<'not-found' | 'conflict' | ContentRefusal>> {
	const problem = taskContentProblem(input.content, await selfVaultIdFor(db, userId));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const nextEligibleAt = initialNextEligibleAt(input.schedule, ownerTimeZone);
	const rows = await db
		.update(selfTasks)
		.set({
			...sealedTaskColumns(input.content, input.expectedRevision + 1),
			active: input.active,
			creditsAwarded: input.creditsAwarded,
			schedule: input.schedule,
			timezoneOwnerUserId: userId,
			nextEligibleAt,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(selfTasks.id, taskId),
				eq(selfTasks.ownerId, userId),
				eq(selfTasks.revision, input.expectedRevision)
			)
		)
		.returning({ id: selfTasks.id });
	if (rows.length > 0) {
		return { ok: true };
	}
	const [exists] = await db
		.select({ id: selfTasks.id })
		.from(selfTasks)
		.where(and(eq(selfTasks.id, taskId), eq(selfTasks.ownerId, userId)))
		.limit(1);
	return { ok: false, reason: exists ? 'conflict' : 'not-found' };
}

export async function getPartnershipTasksPage(
	db: Db,
	partnershipId: string,
	userId: string,
	viewerTimezone: string
): Promise<PartnershipTasksPageView | null> {
	const membership = await requireTaskMembership(db, partnershipId, userId, viewerTimezone);
	if (!membership) {
		return null;
	}
	const visibilityRecord = {
		status: membership.partnership.status,
		control: membership.partnership.control,
		inviterId:
			membership.partnership.role === 'inviter'
				? membership.viewerId
				: membership.counterpartUserId,
		inviteeId:
			membership.partnership.role === 'invitee' ? membership.viewerId : membership.counterpartUserId
	};

	const [tasks, completions] = await Promise.all([
		db
			.select(partnershipTaskColumns)
			.from(partnershipTasks)
			.where(eq(partnershipTasks.partnershipId, partnershipId))
			.orderBy(
				desc(partnershipTasks.active),
				desc(partnershipTasks.createdAt),
				asc(partnershipTasks.id)
			),
		db
			.select(partnershipTaskCompletionColumns)
			.from(partnershipTaskCompletions)
			.where(eq(partnershipTaskCompletions.partnershipId, partnershipId))
			.orderBy(desc(partnershipTaskCompletions.createdAt), desc(partnershipTaskCompletions.id))
	]);

	return {
		partner: {
			id: partnershipId,
			name: membership.partnership.partnerName,
			canManageTasks: membership.canManage,
			canCompleteTasks: membership.canComplete,
			counterpartUserId: membership.counterpartUserId,
			counterpartTimezone: membership.counterpartTimezone
		},
		tasks: tasks
			.filter((row) =>
				canViewPartnershipTask(
					{
						...visibilityRecord,
						partnershipId: row.partnershipId,
						createdByUserId: row.createdByUserId,
						active: row.active,
						nextEligibleAt: row.nextEligibleAt
					},
					userId
				)
			)
			.map((row) => toPartnershipTaskView(row, membership)),
		completions: completions.map((row) => toPartnershipTaskCompletionView(row, userId))
	};
}

export async function createPartnershipTask(
	db: Db,
	partnershipId: string,
	userId: string,
	viewerTimezone: string,
	taskId: string,
	input: TaskInput
): Promise<CreateTaskResult<'not-a-member' | 'forbidden' | 'bad-timezone-owner' | ContentRefusal>> {
	const membership = await requireTaskMembership(db, partnershipId, userId, viewerTimezone);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!membership.canManage) {
		return { ok: false, reason: 'forbidden' };
	}
	if (
		input.timezoneOwnerUserId !== membership.viewerId &&
		input.timezoneOwnerUserId !== membership.counterpartUserId
	) {
		return { ok: false, reason: 'bad-timezone-owner' };
	}
	const problem = taskContentProblem(input.content, await partnershipVaultIdFor(db, partnershipId));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const ownerTimeZone =
		input.timezoneOwnerUserId === membership.viewerId
			? membership.viewerTimezone
			: membership.counterpartTimezone;
	const now = new Date();

	const inserted = await db
		.insert(partnershipTasks)
		.values({
			id: taskId,
			partnershipId,
			createdByUserId: userId,
			timezoneOwnerUserId: input.timezoneOwnerUserId,
			...sealedTaskColumns(input.content, 0),
			active: input.active,
			creditsAwarded: input.creditsAwarded,
			schedule: input.schedule,
			nextEligibleAt: initialNextEligibleAt(input.schedule, ownerTimeZone, now),
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing()
		.returning({ id: partnershipTasks.id });
	if (inserted.length === 0) {
		return { ok: false, reason: 'id-taken' };
	}

	return { ok: true, id: taskId };
}

export async function getPartnershipTaskForUser(
	db: Db,
	partnershipId: string,
	userId: string,
	viewerTimezone: string,
	taskId: string
): Promise<{
	partner: {
		id: string;
		name: string;
		canManageTasks: boolean;
		canCompleteTasks: boolean;
		counterpartUserId: string;
		counterpartTimezone: string;
	};
	task: PartnershipTaskView;
} | null> {
	const membership = await requireTaskMembership(db, partnershipId, userId, viewerTimezone);
	if (!membership) {
		return null;
	}

	const rows = await db
		.select(partnershipTaskColumns)
		.from(partnershipTasks)
		.where(and(eq(partnershipTasks.id, taskId), eq(partnershipTasks.partnershipId, partnershipId)))
		.limit(1);
	const [row] = rows;
	if (!row) {
		return null;
	}

	return {
		partner: {
			id: partnershipId,
			name: membership.partnership.partnerName,
			canManageTasks: membership.canManage,
			canCompleteTasks: membership.canComplete,
			counterpartUserId: membership.counterpartUserId,
			counterpartTimezone: membership.counterpartTimezone
		},
		task: toPartnershipTaskView(row, membership)
	};
}

export async function updatePartnershipTask(
	db: Db,
	partnershipId: string,
	userId: string,
	viewerTimezone: string,
	taskId: string,
	input: TaskInput & { expectedRevision: number }
): Promise<
	TaskResult<
		'not-a-member' | 'forbidden' | 'not-found' | 'bad-timezone-owner' | 'conflict' | ContentRefusal
	>
> {
	const membership = await requireTaskMembership(db, partnershipId, userId, viewerTimezone);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!membership.canManage) {
		return { ok: false, reason: 'forbidden' };
	}
	if (
		input.timezoneOwnerUserId !== membership.viewerId &&
		input.timezoneOwnerUserId !== membership.counterpartUserId
	) {
		return { ok: false, reason: 'bad-timezone-owner' };
	}
	const ownerTimeZone =
		input.timezoneOwnerUserId === membership.viewerId
			? membership.viewerTimezone
			: membership.counterpartTimezone;

	const existingRows = await db
		.select({ createdByUserId: partnershipTasks.createdByUserId })
		.from(partnershipTasks)
		.where(and(eq(partnershipTasks.id, taskId), eq(partnershipTasks.partnershipId, partnershipId)))
		.limit(1);
	const [existing] = existingRows;
	if (!existing) {
		return { ok: false, reason: 'not-found' };
	}
	if (existing.createdByUserId !== userId) {
		return { ok: false, reason: 'forbidden' };
	}
	const problem = taskContentProblem(input.content, await partnershipVaultIdFor(db, partnershipId));
	if (problem) {
		return { ok: false, reason: problem };
	}

	// Compare-and-swap on `revision`, as `updateSelfTask`.
	const rows = await db
		.update(partnershipTasks)
		.set({
			timezoneOwnerUserId: input.timezoneOwnerUserId,
			...sealedTaskColumns(input.content, input.expectedRevision + 1),
			active: input.active,
			creditsAwarded: input.creditsAwarded,
			schedule: input.schedule,
			nextEligibleAt: initialNextEligibleAt(input.schedule, ownerTimeZone),
			updatedAt: new Date()
		})
		.where(
			and(
				eq(partnershipTasks.id, taskId),
				eq(partnershipTasks.partnershipId, partnershipId),
				eq(partnershipTasks.revision, input.expectedRevision)
			)
		)
		.returning({ id: partnershipTasks.id });
	if (rows.length === 0) {
		return { ok: false, reason: 'conflict' };
	}
	return { ok: true };
}

export async function completeSelfTask(
	db: Db,
	userId: string,
	viewerTimezone: string,
	taskId: string,
	now: Date = new Date()
): Promise<TaskResult<'not-found' | 'inactive' | 'not-ready'>> {
	const rows = await db
		.select(selfTaskColumns)
		.from(selfTasks)
		.where(and(eq(selfTasks.id, taskId), eq(selfTasks.ownerId, userId)))
		.limit(1);
	const [task] = rows;
	if (!task) {
		return { ok: false, reason: 'not-found' };
	}
	if (!task.active) {
		return { ok: false, reason: 'inactive' };
	}
	if (!isTaskCompletableAt(task, now)) {
		return { ok: false, reason: 'not-ready' };
	}

	const ownerTimeZone = viewerTimezone;
	const recentCompletions =
		task.schedule.mode === 'rolling-window' && task.schedule.limit
			? await recentSelfTaskCompletionTimes(
					db,
					task.id,
					Math.max(task.schedule.limit.completions - 1, 0)
				)
			: [];
	const nextEligibleAt = nextEligibleAtAfterCompletion(
		task.schedule,
		ownerTimeZone,
		now,
		recentCompletions
	);
	const nextCredits = (await readSelfRewardCredits(db, userId)) + task.creditsAwarded;
	const nextActive = task.schedule.mode === 'one-off' ? false : task.active;

	await db.batch([
		db.insert(selfTaskCompletions).values({
			ownerId: userId,
			taskId: task.id,
			...completionSnapshot(task),
			creditsAwarded: task.creditsAwarded,
			createdAt: now,
			updatedAt: now
		}),
		db
			.update(selfTasks)
			.set({
				active: nextActive,
				lastCompletedAt: now,
				completedCount: task.completedCount + 1,
				nextEligibleAt,
				updatedAt: now
			})
			.where(and(eq(selfTasks.id, taskId), eq(selfTasks.ownerId, userId))),
		db
			.insert(selfRewardCredits)
			.values({ ownerId: userId, credits: nextCredits, createdAt: now, updatedAt: now })
			.onConflictDoUpdate({
				target: selfRewardCredits.ownerId,
				set: { credits: nextCredits, updatedAt: now }
			})
	]);

	return { ok: true };
}

export async function completePartnershipTask(
	db: Db,
	input: { partnershipId: string; taskId: string; userId: string; viewerTimezone: string },
	now: Date = new Date()
): Promise<
	TaskResult<'not-a-member' | 'not-found' | 'not-allowed' | 'inactive' | 'own-task' | 'not-ready'>
> {
	const membership = await requireTaskMembership(
		db,
		input.partnershipId,
		input.userId,
		input.viewerTimezone
	);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!membership.canComplete) {
		return { ok: false, reason: 'not-allowed' };
	}

	const rows = await db
		.select(partnershipTaskColumns)
		.from(partnershipTasks)
		.where(
			and(
				eq(partnershipTasks.id, input.taskId),
				eq(partnershipTasks.partnershipId, input.partnershipId)
			)
		)
		.limit(1);
	const [task] = rows;
	if (!task) {
		return { ok: false, reason: 'not-found' };
	}
	if (!task.active) {
		return { ok: false, reason: 'inactive' };
	}
	if (task.createdByUserId === input.userId) {
		return { ok: false, reason: 'own-task' };
	}
	if (!isTaskCompletableAt(task, now)) {
		return { ok: false, reason: 'not-ready' };
	}

	const ownerTimeZone =
		task.timezoneOwnerUserId === membership.viewerId
			? membership.viewerTimezone
			: membership.counterpartTimezone;
	const recentCompletions =
		task.schedule.mode === 'rolling-window' && task.schedule.limit
			? await recentPartnershipTaskCompletionTimes(
					db,
					task.id,
					Math.max(task.schedule.limit.completions - 1, 0)
				)
			: [];
	const nextEligibleAt = nextEligibleAtAfterCompletion(
		task.schedule,
		ownerTimeZone,
		now,
		recentCompletions
	);
	const nextCredits =
		(await readPartnershipRewardCredits(db, input.partnershipId, input.userId)) +
		task.creditsAwarded;
	const nextActive = task.schedule.mode === 'one-off' ? false : task.active;

	await db.batch([
		db.insert(partnershipTaskCompletions).values({
			partnershipId: input.partnershipId,
			taskId: task.id,
			completedByUserId: input.userId,
			createdByUserId: task.createdByUserId,
			...completionSnapshot(task),
			creditsAwarded: task.creditsAwarded,
			createdAt: now,
			updatedAt: now
		}),
		db
			.update(partnershipTasks)
			.set({
				active: nextActive,
				lastCompletedAt: now,
				completedCount: task.completedCount + 1,
				nextEligibleAt,
				updatedAt: now
			})
			.where(
				and(
					eq(partnershipTasks.id, input.taskId),
					eq(partnershipTasks.partnershipId, input.partnershipId)
				)
			),
		db
			.insert(partnershipRewardCredits)
			.values({
				partnershipId: input.partnershipId,
				userId: input.userId,
				credits: nextCredits,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [partnershipRewardCredits.partnershipId, partnershipRewardCredits.userId],
				set: { credits: nextCredits, updatedAt: now }
			})
	]);

	return { ok: true };
}

export async function listHomePartnerTaskSections(
	db: Db,
	userId: string,
	viewerTimezone: string,
	partners: PartnerView[]
): Promise<HomePartnerTasksSectionView[]> {
	if (partners.length === 0) {
		return [];
	}

	const partnershipIds = partners.map((partner) => partner.id);
	const [partnershipRows, taskRows] = await Promise.all([
		db
			.select({
				id: partnerships.id,
				status: partnerships.status,
				control: partnerships.control,
				inviterId: partnerships.inviterId,
				inviteeId: partnerships.inviteeId,
				inviterName: partnerships.inviterName,
				inviteeName: partnerships.inviteeName,
				inviterRole: partnerships.inviterRole,
				inviteeRole: partnerships.inviteeRole
			})
			.from(partnerships)
			.where(inArray(partnerships.id, partnershipIds)),
		db
			.select(partnershipTaskColumns)
			.from(partnershipTasks)
			.where(
				and(
					inArray(partnershipTasks.partnershipId, partnershipIds),
					eq(partnershipTasks.active, true)
				)
			)
			.orderBy(desc(partnershipTasks.createdAt), asc(partnershipTasks.id))
	]);

	const completablePartnerships = new Map(
		partnershipRows.map((row) => [
			row.id,
			row.status === 'accepted' && (row.control === 'both' || row.control !== sideOf(row, userId))
		])
	);
	const tasksByPartnership = new Map<string, PartnershipTaskView[]>();
	const partnerById = new Map(partners.map((partner) => [partner.id, partner]));

	for (const row of taskRows) {
		if (!completablePartnerships.get(row.partnershipId)) {
			continue;
		}
		if (row.createdByUserId === userId) {
			continue;
		}
		const partner = partnerById.get(row.partnershipId);
		if (!partner) {
			continue;
		}
		const membership = await requireTaskMembership(db, row.partnershipId, userId, viewerTimezone);
		if (!membership) {
			continue;
		}
		const list = tasksByPartnership.get(row.partnershipId) ?? [];
		list.push(toPartnershipTaskView(row, membership));
		tasksByPartnership.set(row.partnershipId, list);
	}

	return partners.flatMap((partner) => {
		if (!completablePartnerships.get(partner.id)) {
			return [];
		}
		return [
			{
				partnershipId: partner.id,
				name: partner.name,
				image: partner.image,
				tasks: tasksByPartnership.get(partner.id) ?? []
			}
		];
	});
}

/**
 * How many rows a section widget's body lists before it stops and counts.
 *
 * Three fits a phone under the other cards; the card's own header link is the
 * way to see the rest, so a longer list would just push the next card down.
 */
const WIDGET_PREVIEW_LIMIT = 3;

type TaskWidgetRow = {
	id: string;
	title: string | null;
	ciphertext: string | null;
	vaultId: string | null;
	payloadVersion: number | null;
	active: boolean;
	creditsAwarded: number;
	nextEligibleAt: Date | null;
	/** Whose section this came from on /home/tasks. Null for your own. */
	context?: string | null;
};

function toTasksWidgetView(rows: TaskWidgetRow[], viewerActs: boolean, now: Date): TasksWidgetView {
	const ready = rows.filter((row) => isTaskCompletableAt(row, now));
	return {
		viewerActs,
		// The managing side never sees a "ready" list: they do not complete these,
		// so the card shows activeCount instead. Withheld here rather than in the
		// component so the titles are not serialised into the page for nothing.
		ready: viewerActs
			? ready.slice(0, WIDGET_PREVIEW_LIMIT).map((row) => ({
					id: row.id,
					title: row.title ?? '',
					kind: 'task' as const,
					sealed: sealedRef(row.id, row),
					note: row.creditsAwarded > 0 ? `+${row.creditsAwarded}` : null,
					context: row.context ?? null
				}))
			: [],
		readyCount: ready.length,
		waitingCount: rows.length - ready.length,
		activeCount: rows.length
	};
}

/**
 * The /home tasks card: your own tasks AND every partner task assigned to you.
 *
 * It has to be both, because /home/tasks — the page the card links to — is both.
 * A card that counted only self tasks said "nothing to do" while a partner task
 * sat waiting one tap away, which is exactly the thing the cards exist to stop.
 *
 * Which partner tasks count is decided the same way `listHomePartnerTaskSections`
 * decides it: the partnerships where you are on the completing side, minus the
 * ones you wrote yourself. Partnerships you *manage* contribute nothing here —
 * managing them happens on their own partner page, and that is also why
 * `viewerActs` is always true on /home.
 *
 * Active rows only, and only the columns the card reads — deliberately not
 * `getSelfTasksSection`, which also pulls every completion ever recorded for a
 * body that shows at most three titles. D1 charges for rows read.
 */
export async function getHomeTasksWidget(
	db: Db,
	userId: string,
	partners: PartnerView[],
	now: Date = new Date()
): Promise<TasksWidgetView> {
	const partnershipIds = partners.map((partner) => partner.id);

	const [selfRows, partnershipRows, partnerTaskRows] = await Promise.all([
		db
			.select({
				id: selfTasks.id,
				title: selfTasks.title,
				ciphertext: selfTasks.ciphertext,
				vaultId: selfTasks.vaultId,
				payloadVersion: selfTasks.payloadVersion,
				active: selfTasks.active,
				creditsAwarded: selfTasks.creditsAwarded,
				nextEligibleAt: selfTasks.nextEligibleAt
			})
			.from(selfTasks)
			.where(and(eq(selfTasks.ownerId, userId), eq(selfTasks.active, true))),
		// `in ()` is a syntax error in SQLite, and a fresh account has no partners.
		partnershipIds.length === 0
			? Promise.resolve([])
			: db
					.select({
						id: partnerships.id,
						status: partnerships.status,
						control: partnerships.control,
						inviterId: partnerships.inviterId,
						inviteeId: partnerships.inviteeId
					})
					.from(partnerships)
					.where(inArray(partnerships.id, partnershipIds)),
		partnershipIds.length === 0
			? Promise.resolve([])
			: db
					.select({
						id: partnershipTasks.id,
						partnershipId: partnershipTasks.partnershipId,
						createdByUserId: partnershipTasks.createdByUserId,
						title: partnershipTasks.title,
						ciphertext: partnershipTasks.ciphertext,
						vaultId: partnershipTasks.vaultId,
						payloadVersion: partnershipTasks.payloadVersion,
						active: partnershipTasks.active,
						creditsAwarded: partnershipTasks.creditsAwarded,
						nextEligibleAt: partnershipTasks.nextEligibleAt
					})
					.from(partnershipTasks)
					.where(
						and(
							inArray(partnershipTasks.partnershipId, partnershipIds),
							eq(partnershipTasks.active, true)
						)
					)
	]);

	const completable = new Map(
		partnershipRows.map((row) => [row.id, canCompleteFromPartnership(row, userId)])
	);
	const nameById = new Map(partners.map((partner) => [partner.id, partner.name]));

	const partnerRows: TaskWidgetRow[] = partnerTaskRows.flatMap((row) => {
		if (!completable.get(row.partnershipId)) {
			return [];
		}
		// Authorship is independent of control: under shared control you complete
		// their tasks, never your own.
		if (row.createdByUserId === userId) {
			return [];
		}
		const name = nameById.get(row.partnershipId);
		if (!name) {
			return [];
		}
		return [{ ...row, context: name }];
	});

	// Sorted across both sources rather than per source, so the three rows the
	// card shows are the three most overdue, not the first three self tasks.
	// SQLite sorts nulls first and so does this: no nextEligibleAt means always
	// ready, which belongs at the top.
	const rows = [...selfRows, ...partnerRows].sort((a, b) => {
		const left = a.nextEligibleAt?.getTime() ?? Number.NEGATIVE_INFINITY;
		const right = b.nextEligibleAt?.getTime() ?? Number.NEGATIVE_INFINITY;
		return left - right;
	});

	// /home only ever shows the completing side, so the viewer always acts.
	return toTasksWidgetView(rows, true, now);
}

/** The /partner/[id] tasks card. Null when this viewer has no business here. */
export async function getPartnershipTasksWidget(
	db: Db,
	partnershipId: string,
	userId: string,
	viewerTimezone: string,
	now: Date = new Date()
): Promise<TasksWidgetView | null> {
	const membership = await requireTaskMembership(db, partnershipId, userId, viewerTimezone);
	if (!membership) {
		return null;
	}

	const rows = await db
		.select({
			id: partnershipTasks.id,
			partnershipId: partnershipTasks.partnershipId,
			createdByUserId: partnershipTasks.createdByUserId,
			title: partnershipTasks.title,
			ciphertext: partnershipTasks.ciphertext,
			vaultId: partnershipTasks.vaultId,
			payloadVersion: partnershipTasks.payloadVersion,
			active: partnershipTasks.active,
			creditsAwarded: partnershipTasks.creditsAwarded,
			nextEligibleAt: partnershipTasks.nextEligibleAt
		})
		.from(partnershipTasks)
		.where(
			and(eq(partnershipTasks.partnershipId, partnershipId), eq(partnershipTasks.active, true))
		)
		.orderBy(
			asc(partnershipTasks.nextEligibleAt),
			desc(partnershipTasks.createdAt),
			asc(partnershipTasks.id)
		);

	const visibilityRecord = {
		status: membership.partnership.status,
		control: membership.partnership.control,
		inviterId:
			membership.partnership.role === 'inviter'
				? membership.viewerId
				: membership.counterpartUserId,
		inviteeId:
			membership.partnership.role === 'invitee' ? membership.viewerId : membership.counterpartUserId
	};

	const visible = rows.filter((row) =>
		canViewPartnershipTask({ ...visibilityRecord, ...row }, userId)
	);

	// Authorship is independent of control: under shared control both sides can
	// complete, but never their own task, so these drop out of "ready" even
	// though `canComplete` is true for the partnership as a whole.
	const actionable = membership.canComplete
		? visible.filter((row) => row.createdByUserId !== userId)
		: visible;

	const view = toTasksWidgetView(actionable, membership.canComplete, now);
	// The managing side's count is of everything they can see, not just the
	// subset someone else could complete.
	return membership.canComplete ? view : { ...view, activeCount: visible.length };
}

/** Which side of the partnership row `userId` is on, or null for neither. */
function sideOf(
	row: { inviterId: string; inviteeId: string | null },
	userId: string
): 'inviter' | 'invitee' | null {
	if (row.inviterId === userId) {
		return 'inviter';
	}
	if (row.inviteeId === userId) {
		return 'invitee';
	}
	return null;
}
