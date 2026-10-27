/**
 * What a task's row in the checklist says, worked out away from the markup
 * so it can be tested in node. See docs/tasks.md, "The checklist".
 */
import type { ContentSaveTarget } from './description-ticks';
import type { ContextSpaceView, TaskRepeatUnit, TaskView } from './types';

/**
 * One task as a list shows it, with what the list needs to act on it. The
 * same task reads differently in Everyone (a chip saying whose space it is
 * in) and in one space's context (no chip: the switcher says whose).
 */
export type TaskEntry = {
	task: TaskView;
	/** The form action that completes it, or null when the viewer does not complete it. */
	completeAction: string | null;
	/** The form action that takes a completion of it back, alongside `completeAction`. */
	undoAction?: string | null;
	/** Whose space it is in, as a chip, on a list of several spaces (Everyone). */
	space?: ContextSpaceView | null;
	/** The partner it is with, for "Jun's time" and its detail; null for the viewer's own. */
	partnerName?: string | null;
	/** Its edit page, when the viewer may edit it. */
	editHref?: string | null;
	/** Where ticking a to-do item in its description saves, beside `editHref`. */
	contentSave?: ContentSaveTarget | null;
};

/**
 * Which way round the viewer stands to a list. `to-do`: theirs to tick off.
 * `set`: tasks they set for their partner, which they watch rather than tick.
 */
export type TaskListMode = 'to-do' | 'set';

/**
 * The window a quota is counted over, as it is said: "this week", "today",
 * "in 2 weeks". It rolls rather than following the calendar (docs/tasks.md),
 * which "this week" glosses over — but "in the 7 days up to now" is a mouthful
 * a list cannot afford, and the task's form explains the difference.
 */
export function quotaPeriod(every: number, unit: TaskRepeatUnit): string {
	if (every !== 1) {
		return `in ${every} ${unit}s`;
	}
	return unit === 'day' ? 'today' : `this ${unit}`;
}

/**
 * The rolling window's quota, in a few words: "1 left" for whoever completes
 * it, "2 of 3 this week" for whoever set it. Null for a task with no quota, and for one
 * whose window is empty on the to-do side, where "3 left" says nothing the
 * schedule ("3× a week") has not.
 */
export function quotaText(task: TaskView, mode: TaskListMode): string | null {
	if (task.schedule.mode !== 'rolling-window' || !task.schedule.limit) {
		return null;
	}
	const used = task.windowCompletions;
	if (used === null) {
		return null;
	}
	const { completions, every, unit } = task.schedule.limit;
	if (mode === 'set') {
		return `${used} of ${completions} ${quotaPeriod(every, unit)}`;
	}
	return used > 0 ? `${Math.max(completions - used, 0)} left` : null;
}

/** Whether a task opens again later, rather than now or never. */
export function opensLater(task: TaskView, now: Date = new Date()): boolean {
	return (
		task.active && task.nextEligibleAt !== null && task.nextEligibleAt.getTime() > now.getTime()
	);
}
