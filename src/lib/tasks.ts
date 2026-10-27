import { type AssignedRecord, actsOn, managesRecord, type SpaceForRules } from './spaces';
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

/** A task as its rules see it: who it is from and for, and whether it is open now. */
export type TaskRuleRecord = AssignedRecord & { active: boolean; nextEligibleAt: Date | null };

/** One availability check for every task. */
export function isTaskCompletableAt(
	record: Pick<TaskRuleRecord, 'active' | 'nextEligibleAt'>,
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
 * Whether the viewer may complete this task now: it is theirs to do
 * (`actsOn` — assigned to them, on the side that acts, and not one they
 * wrote) and it is open. See docs/tasks.md.
 */
export function canCompleteTask(
	record: TaskRuleRecord,
	space: SpaceForRules,
	viewerId: string,
	now: Date = new Date()
): boolean {
	return actsOn(record, space, viewerId) && isTaskCompletableAt(record, now);
}

/**
 * Which of a tasks page's two lists a task is on for this viewer: **to do**,
 * the ones they complete, or **set for others**, the ones they set for
 * someone else in a shared space they manage. Null for neither, which hides
 * it: one left on the wrong side by a change of who manages stays stored, and
 * shows again if it changes back.
 */
export function taskListFor(
	record: AssignedRecord,
	space: SpaceForRules,
	viewerId: string
): 'to-do' | 'set' | null {
	if (actsOn(record, space, viewerId)) {
		return 'to-do';
	}
	if (space.kind === 'shared' && managesRecord(record, space, viewerId)) {
		return 'set';
	}
	return null;
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
