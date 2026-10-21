/**
 * What an idea's trackers hold as its story goes (docs/daydreams.md,
 * "Trackers"): a meter, a count, a list or a line the user watches move.
 *
 * A passage stores every tracker's value after it (`meta.trackers`, by id),
 * and only when one moved, so the value at any point is the latest stored on
 * the path there, and each branch has its own. Before any passage moved one,
 * it holds its start, as the user wrote it.
 *
 * The model is told the values and moves them by name, with new values only
 * (`server/daydream/prompt.ts`, `trackersNote`). What it writes is coerced to
 * each tracker's kind here — a meter to a whole number from 0 to 100, a
 * count to a whole number — and anything that cannot be is dropped, rather
 * than costing the passage its other changes.
 *
 * Pure and alias-free.
 */

import { DAYDREAM_LIMITS, type IdeaTracker, type TrackerValue } from '../daydream';
import type { OpenedTurn } from './tree';

/** Every tracker's value at one point in the story, by tracker id. */
export type TrackerValues = Record<string, TrackerValue>;

export const METER_MIN = 0;
export const METER_MAX = 100;

/** The most items a list tracker holds; the stored schema's cap (`trackerValueSchema`). */
export const MAX_LIST_ITEMS = 20;

/** A count beyond this is a model writing nonsense, not a story counting. */
const MAX_COUNT = 1_000_000_000;

const clampMeter = (value: number) => Math.min(METER_MAX, Math.max(METER_MIN, Math.round(value)));

const clampCount = (value: number) => Math.min(MAX_COUNT, Math.max(-MAX_COUNT, Math.round(value)));

/** A move written relative to where it was: `+5`, `-10`. */
const RELATIVE = /^(?<sign>[+-])\s*(?<amount>\d+(?:\.\d+)?)$/u;

/** How a list's start separates its items: lines, or semicolons on one line. */
const LIST_SEPARATOR = /\n|;/u;

/** A number as written: `55`, `"55"`, or relative to `from`, `"+5"` or `"-10"`; null for anything else. */
function readNumber(raw: unknown, from: number): number | null {
	if (typeof raw === 'number') {
		return Number.isFinite(raw) ? raw : null;
	}
	if (typeof raw !== 'string') {
		return null;
	}
	const relative: RegExpExecArray | null = RELATIVE.exec(raw.trim());
	if (relative?.groups) {
		const amount = Number(relative.groups.amount);
		return relative.groups.sign === '+' ? from + amount : from - amount;
	}
	const absolute = Number(raw.trim());
	return raw.trim() !== '' && Number.isFinite(absolute) ? absolute : null;
}

/** A list's items: trimmed, none empty, too long or twice, at most `MAX_LIST_ITEMS`. */
function readList(items: readonly unknown[]): string[] {
	const kept: string[] = [];
	for (const item of items) {
		const text = typeof item === 'string' ? item.trim() : '';
		if (
			text !== '' &&
			text.length <= DAYDREAM_LIMITS.trackerItem &&
			!kept.some((other) => other.toLocaleLowerCase() === text.toLocaleLowerCase())
		) {
			kept.push(text);
		}
	}
	return kept.slice(0, MAX_LIST_ITEMS);
}

/**
 * Where a tracker starts, from what the user wrote: a meter's or count's
 * number (0 when they wrote none), a list's items one to a line, or the line.
 */
export function startValue(tracker: Pick<IdeaTracker, 'kind' | 'start'>): TrackerValue {
	switch (tracker.kind) {
		case 'meter':
			return clampMeter(readNumber(tracker.start, 0) ?? 0);
		case 'count':
			return clampCount(readNumber(tracker.start, 0) ?? 0);
		case 'list':
			return readList(tracker.start.split(LIST_SEPARATOR));
		default:
			return tracker.start.trim().slice(0, DAYDREAM_LIMITS.trackerText);
	}
}

/** Whether a stored value is one a tracker of this kind holds; not after its kind was changed. */
function fits(kind: IdeaTracker['kind'], value: TrackerValue | undefined): value is TrackerValue {
	switch (kind) {
		case 'meter':
		case 'count':
			return typeof value === 'number';
		case 'list':
			return Array.isArray(value);
		default:
			return typeof value === 'string';
	}
}

/** A tracker's value in `values`, or its start when it has none there that fits it. */
export function valueIn(tracker: IdeaTracker, values: TrackerValues): TrackerValue {
	const stored = values[tracker.id];
	return fits(tracker.kind, stored) ? stored : startValue(tracker);
}

/** Every tracker's value in `values`, each falling back to its start: the full set, by id. */
export function completeValues(
	trackers: readonly IdeaTracker[],
	values: TrackerValues
): TrackerValues {
	return Object.fromEntries(trackers.map((tracker) => [tracker.id, valueIn(tracker, values)]));
}

/**
 * The trackers' values at the end of `path`: the latest a passage on it
 * stored, each tracker falling back to its start. Values stored for a tracker
 * the idea no longer has are left out.
 */
export function trackersAt(
	path: readonly OpenedTurn[],
	trackers: readonly IdeaTracker[]
): TrackerValues {
	for (let index = path.length - 1; index >= 0; index -= 1) {
		const content = path[index]?.content;
		const stored = content?.type === 'text' ? content.meta?.trackers : undefined;
		if (stored) {
			return completeValues(trackers, stored);
		}
	}
	return completeValues(trackers, {});
}

/** One change as the model wrote it, coerced to the tracker's kind; null when it cannot be. */
function coerce(tracker: IdeaTracker, raw: unknown, from: TrackerValue): TrackerValue | null {
	switch (tracker.kind) {
		case 'meter': {
			const number = readNumber(raw, typeof from === 'number' ? from : 0);
			return number === null ? null : clampMeter(number);
		}
		case 'count': {
			const number = readNumber(raw, typeof from === 'number' ? from : 0);
			return number === null ? null : clampCount(number);
		}
		case 'list':
			return Array.isArray(raw) ? readList(raw) : null;
		default:
			return typeof raw === 'string' && raw.trim().length <= DAYDREAM_LIMITS.trackerText
				? raw.trim()
				: null;
	}
}

const same = (a: TrackerValue, b: TrackerValue) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The values after a reply's changes (its metadata's `"trackers"`, by name):
 * every tracker's, for the passage to store, or null when nothing moved —
 * no changes, none naming a tracker the idea has, or none that differs.
 * Names match whatever their case, as the model writes them back.
 */
export function applyTrackerChanges(
	trackers: readonly IdeaTracker[],
	current: TrackerValues,
	changes: unknown
): TrackerValues | null {
	if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
		return null;
	}
	const byName = new Map(
		Object.entries(changes).map(([name, value]) => [name.trim().toLocaleLowerCase(), value])
	);
	const next = completeValues(trackers, current);
	let moved = false;
	for (const tracker of trackers) {
		const key = tracker.name.trim().toLocaleLowerCase();
		if (!byName.has(key)) {
			continue;
		}
		const from = valueIn(tracker, current);
		const to = coerce(tracker, byName.get(key), from);
		if (to !== null && !same(from, to)) {
			next[tracker.id] = to;
			moved = true;
		}
	}
	return moved ? next : null;
}

/** A value as words, for a note or the model: `40`, `Kneel, Eyes down`, or the line. */
export function valueText(value: TrackerValue): string {
	if (Array.isArray(value)) {
		return value.length > 0 ? value.join(', ') : 'none';
	}
	return typeof value === 'number' ? `${value}` : value || 'nothing yet';
}

/** One tracker that a passage moved, and from what to what. */
export type TrackerMove = { id: string; name: string; from: TrackerValue; to: TrackerValue };

/** The trackers that moved between `before` and `after`, in the idea's order. */
export function trackerMoves(
	trackers: readonly IdeaTracker[],
	before: TrackerValues,
	after: TrackerValues
): TrackerMove[] {
	return trackers.flatMap((tracker) => {
		const from = valueIn(tracker, before);
		const to = valueIn(tracker, after);
		return same(from, to) ? [] : [{ id: tracker.id, name: tracker.name, from, to }];
	});
}

/**
 * A move as the note under its passage says it: `Submission 40 → 55`, a
 * list's items added and taken off, or a line's new words.
 */
export function describeMove(move: TrackerMove): string {
	const { name, from, to } = move;
	if (Array.isArray(from) && Array.isArray(to)) {
		const had = new Set(from.map((item) => item.toLocaleLowerCase()));
		const has = new Set(to.map((item) => item.toLocaleLowerCase()));
		const added = to.filter((item) => !had.has(item.toLocaleLowerCase()));
		const removed = from.filter((item) => !has.has(item.toLocaleLowerCase()));
		const parts = [...added.map((item) => `+ ${item}`), ...removed.map((item) => `− ${item}`)];
		return parts.length > 0 ? `${name}: ${parts.join(', ')}` : `${name} reordered`;
	}
	if (typeof from === 'number' && typeof to === 'number') {
		return `${name} ${from} → ${to}`;
	}
	return `${name}: ${valueText(to)}`;
}
