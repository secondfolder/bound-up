import { canEditPartnership, type PartnershipRecord, roleOf } from './partnership';
import type { TaskSchedule } from './types';

/** What the server can see of a task: everything it schedules, credits and checks. */
export type TaskSettings = {
	active: boolean;
	creditsAwarded: number;
	schedule: TaskSchedule;
	timezoneOwnerUserId: string;
};

/**
 * The rest of a task — title, description and completion messages — sealed
 * in the scope's vault (`taskKind` in `sealed-kinds/tasks.ts`). The server
 * stores it and checks only its envelope; `completionMessageCount` is the
 * one thing about the content it is told, so it can still pick a message at
 * random on completion.
 */
export type SealedTaskContent = {
	vaultId: string;
	ciphertext: string;
	payloadVersion: number;
	completionMessageCount: number;
};

export type TaskInput = TaskSettings & { content: SealedTaskContent };

export type PartnershipTaskRecord = Pick<
	PartnershipRecord,
	'status' | 'control' | 'inviterId' | 'inviteeId'
> & {
	partnershipId: string;
	createdByUserId: string;
	active: boolean;
	nextEligibleAt: Date | null;
};

/** Shared control means both members can manage tasks, matching link edits. */
export function canManagePartnershipTasks(
	record: Pick<PartnershipRecord, 'control' | 'inviterId' | 'inviteeId'>,
	userId: string
): boolean {
	return canEditPartnership(record, userId);
}

/**
 * Whether this member is on the completion side of the current control setting.
 *
 * Sole control splits the feature into manager and completer roles; shared
 * control lets both members complete, subject to authorship and availability.
 */
export function canCompleteFromPartnership(
	record: Pick<PartnershipRecord, 'status' | 'control' | 'inviterId' | 'inviteeId'>,
	userId: string
): boolean {
	const role = roleOf(record, userId);
	if (!role || record.status !== 'accepted') {
		return false;
	}
	return record.control === 'both' || record.control !== role;
}

/**
 * Whether this member should currently see the task on the partnership task page.
 *
 * A control flip can leave old tasks in the database that are now assigned to the
 * wrong side for this viewer. Those tasks stay persisted so they can reappear if
 * control changes again, but the current page only shows tasks that are still on
 * this viewer's present side of the split.
 */
export function canViewPartnershipTask(record: PartnershipTaskRecord, userId: string): boolean {
	const canManage = canManagePartnershipTasks(record, userId);
	const canComplete = canCompleteFromPartnership(record, userId);

	if (!(canManage || canComplete)) {
		return false;
	}
	if (canManage && canComplete) {
		return true;
	}
	if (canManage) {
		return record.createdByUserId === userId;
	}
	return record.createdByUserId !== userId;
}

/** One availability check shared by self and partnership tasks. */
export function isTaskCompletableAt(
	record: Pick<PartnershipTaskRecord, 'active' | 'nextEligibleAt'>,
	now: Date = new Date()
): boolean {
	if (!record.active) {
		return false;
	}
	if (!record.nextEligibleAt) {
		return true;
	}
	return record.nextEligibleAt.getTime() <= now.getTime();
}

/**
 * One partnership task completion check.
 *
 * Authorship is independent of control: shared control may let both members
 * complete tasks, but never the one who created that task.
 */
export function canCompletePartnershipTask(
	record: PartnershipTaskRecord,
	viewerId: string,
	now: Date = new Date()
): boolean {
	if (!canCompleteFromPartnership(record, viewerId)) {
		return false;
	}
	if (record.createdByUserId === viewerId) {
		return false;
	}
	return isTaskCompletableAt(record, now);
}

type GroupableTask = {
	active: boolean;
	canComplete: boolean;
	nextEligibleAt: Date | null;
};

function byNextEligible<T extends GroupableTask>(a: T, b: T): number {
	return (
		(a.nextEligibleAt?.getTime() ?? Number.POSITIVE_INFINITY) -
		(b.nextEligibleAt?.getTime() ?? Number.POSITIVE_INFINITY)
	);
}

/**
 * A to-do list of the tasks the viewer does: what can be ticked off now, what
 * opens later (soonest first), and what is inactive. Within "ready" the order
 * they came in is kept. See docs/tasks.md, "The checklist".
 */
export function groupTasksToDo<T extends GroupableTask>(
	tasks: T[]
): { ready: T[]; later: T[]; inactive: T[] } {
	return {
		ready: tasks.filter((task) => task.active && task.canComplete),
		later: tasks.filter((task) => task.active && !task.canComplete).sort(byNextEligible),
		inactive: tasks.filter((task) => !task.active)
	};
}

/**
 * The tasks the viewer set for their partner, from the side that watches
 * rather than ticks: what the partner can do now, what they have done for now
 * (until it opens again), and what is inactive.
 */
export function groupTasksSet<T extends GroupableTask>(
	tasks: T[],
	now: Date = new Date()
): { waiting: T[]; doneForNow: T[]; inactive: T[] } {
	return {
		waiting: tasks.filter((task) => isTaskCompletableAt(task, now)),
		doneForNow: tasks
			.filter((task) => task.active && !isTaskCompletableAt(task, now))
			.sort(byNextEligible),
		inactive: tasks.filter((task) => !task.active)
	};
}
