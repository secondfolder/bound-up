import {
	type Answer,
	type Detail,
	type ItemKey,
	LEVELS,
	type Level,
	type ListPayload,
	type SideKey
} from './answers';
import { kinkById, sidesOf } from './catalog';

/**
 * How a kink list changed between two versions of it. Pure and alias-free;
 * see docs/kink-list.md, "Version history".
 *
 * It compares what was **answered**, never what was inherited: a kink that
 * moved only because its category was made a hard limit is not a change
 * someone made, and listing every kink in it would bury the one that was.
 */

export const CHANGE_GROUPS = [
	'new-limits',
	'more-into',
	'less-into',
	'limits-dropped',
	'more-experience',
	'notes'
] as const;
export type ChangeGroup = (typeof CHANGE_GROUPS)[number];

export const CHANGE_LABELS: Record<ChangeGroup, string> = {
	'new-limits': 'New hard limits',
	'more-into': 'More into',
	'less-into': 'Less into',
	'limits-dropped': 'No longer a hard limit',
	'more-experience': 'More experience',
	notes: 'Notes changed'
};

/** One part of an answer: the whole kink, or one side of its role pair. */
export type Part = 'whole' | SideKey;

export type Change = {
	key: ItemKey;
	part: Part;
	from?: Level;
	to?: Level;
};

export type Changes = Record<ChangeGroup, Change[]>;

function levelOf(answer: Answer | undefined, part: Part): Level | undefined {
	return part === 'whole' ? answer?.level : answer?.sides?.[part]?.level;
}

function detailOf(answer: Answer | undefined, part: Part): Detail | undefined {
	return part === 'whole' ? answer?.detail : answer?.sides?.[part]?.detail;
}

function rank(level: Level): number {
	return LEVELS.indexOf(level);
}

/** Which group a level moving from `from` to `to` belongs in, if any. */
function groupOf(from: Level | undefined, to: Level | undefined): ChangeGroup | null {
	if (from === to) {
		return null;
	}
	if (to === 'limit') {
		return 'new-limits';
	}
	if (from === 'limit') {
		return 'limits-dropped';
	}
	// Answering something for the first time is a move towards it, and clearing an answer one away.
	if (to === undefined) {
		return 'less-into';
	}
	if (from === undefined) {
		return 'more-into';
	}
	return rank(to) > rank(from) ? 'more-into' : 'less-into';
}

function partsOf(key: ItemKey): readonly Part[] {
	const item = kinkById(key);
	return item && sidesOf(item) ? ['whole', 'a', 'b'] : ['whole'];
}

/**
 * Whether a retired kink's change is one nobody could have made: the earlier
 * list was last edited on or after the day it was retired, so the change came
 * after it left the list. Only a device still running an older build could
 * write one, and it would read as a choice made on a kink nobody can see.
 * Changes from before retirement still show, so nothing anyone did vanishes
 * from their history.
 */
function afterRetirement(key: ItemKey, since: Date | undefined): boolean {
	const retiredOn = kinkById(key)?.retiredOn;
	return since !== undefined && retiredOn !== undefined && since >= startOfDay(retiredOn);
}

/** A catalogue date (`YYYY-MM-DD`) as the start of that day, here. */
export function startOfDay(date: string): Date {
	return new Date(`${date}T00:00:00`);
}

/**
 * Everything that moved from `before` to `after`, grouped, in catalogue-key
 * order. `since` is when `before` was last edited, which retired kinks are
 * judged by (`afterRetirement`).
 */
export function changesBetween(before: ListPayload, after: ListPayload, since?: Date): Changes {
	const changes: Changes = {
		'new-limits': [],
		'more-into': [],
		'less-into': [],
		'limits-dropped': [],
		'more-experience': [],
		notes: []
	};
	const keys = [...new Set([...Object.keys(before.answers), ...Object.keys(after.answers)])].sort();
	for (const key of keys) {
		if (afterRetirement(key, since)) {
			continue;
		}
		const was = before.answers[key];
		const is = after.answers[key];
		for (const part of partsOf(key)) {
			const from = levelOf(was, part);
			const to = levelOf(is, part);
			const group = groupOf(from, to);
			if (group) {
				changes[group].push({ key, part, from, to });
			}
			const experienceBefore = detailOf(was, part)?.experience ?? 0;
			const experienceAfter = detailOf(is, part)?.experience ?? 0;
			if (experienceAfter > experienceBefore) {
				changes['more-experience'].push({ key, part });
			}
		}
		if ((was?.note ?? '').trim() !== (is?.note ?? '').trim()) {
			changes.notes.push({ key, part: 'whole' });
		}
	}
	return changes;
}

export function changeCount(changes: Changes): number {
	return CHANGE_GROUPS.reduce((total, group) => total + changes[group].length, 0);
}

/** One point in a kink's history: a version (or now), and its answer then. */
export type TimelinePoint<T> = { at: T; answer: Answer | undefined };

/**
 * A kink's answer over time: the first version, then only the versions where
 * it changed. `lists` is oldest first, as the history page has them.
 */
export function kinkTimeline<T>(
	lists: { at: T; list: ListPayload }[],
	key: ItemKey
): TimelinePoint<T>[] {
	const points: TimelinePoint<T>[] = [];
	let previous: string | undefined;
	for (const { at, list } of lists) {
		const answer = list.answers[key];
		const fingerprint = JSON.stringify(answer ? { ...answer, at: 0 } : null);
		if (fingerprint !== previous) {
			points.push({ at, answer });
			previous = fingerprint;
		}
	}
	return points;
}
