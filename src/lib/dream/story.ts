/**
 * What the story so far adds up to, along the branch being read
 * (docs/dreams.md, "Playing" and "Memory"): what to send the model for the
 * next passage, the elements as they now stand, when a scene has ended and
 * wants summarising, and the phrases not to reuse.
 *
 * Works on opened turns, so the page and the simulated player share it.
 * Pure and alias-free.
 */

import type {
	DreamDetail,
	DreamInputTurn,
	DreamPassageTurn,
	DreamSummary,
	DreamTurn
} from '../sealed-kinds/dreams';
import type { DreamElement } from './elements';
import { type FooterEntry, parseFooter } from './footer';
import { findTag, findTags, parseMarkup, plainText } from './markup';
import { repeatedPhrases } from './repetition';

/** A turn on the path, opened: null when it could not be. */
export type PathTurn = { id: string; turn: DreamTurn | null };

/** What the user did after a passage, as the prompt describes it. */
export type UserTurn = { kind: 'continue' } | { kind: 'words'; text: string };

export type HistoryEntry = { passage: string; turn: UserTurn };

/** Passages always sent word for word, however recently a scene was summarised. */
export const RECENT_PASSAGES = 6;
/** The most passages sent word for word. Matches `MAX_HISTORY` in `requests.ts`. */
export const MAX_RECENT_PASSAGES = 16;
/** A scene that has run this long is summarised even without a scene break. */
export const SCENE_LENGTH = 8;

function isPassage(entry: PathTurn): entry is { id: string; turn: DreamPassageTurn } {
	return entry.turn?.kind === 'passage';
}

function isInput(entry: PathTurn | undefined): entry is { id: string; turn: DreamInputTurn } {
	return entry?.turn?.kind === 'input';
}

/** What the user's turn tells the model. Only words, for now; the rest come with phase 3. */
export function userTurnOf(input: DreamInputTurn | null): UserTurn {
	const text = input?.text.trim() ?? '';
	return text ? { kind: 'words', text } : { kind: 'continue' };
}

/**
 * The history for the next passage: each passage on the path with what the
 * user did after it. A passage followed straight by another (Continue) was
 * followed by "carry on". `pending` is the turn the next passage answers.
 * Only the passages from `fromIndex` on go word for word; earlier ones are
 * in the summaries.
 */
export function historyFor(path: readonly PathTurn[], pending: UserTurn): HistoryEntry[] {
	const entries: HistoryEntry[] = [];
	for (const [index, entry] of path.entries()) {
		if (!isPassage(entry)) {
			continue;
		}
		const next = path[index + 1];
		let turn: UserTurn;
		if (next === undefined) {
			turn = pending;
		} else if (isInput(next)) {
			// The last input on the path is the one being answered.
			turn = index + 2 >= path.length ? pending : userTurnOf(next.turn);
		} else {
			turn = { kind: 'continue' };
		}
		entries.push({ passage: entry.turn.source, turn });
	}
	return entries;
}

/**
 * What to send for the next passage: the summaries of finished scenes on
 * this path, and the passages since, word for word (at least the last
 * `RECENT_PASSAGES`, never more than `MAX_RECENT_PASSAGES`).
 */
export function memoryFor(
	path: readonly PathTurn[],
	summaries: readonly { turnId: string; summary: DreamSummary }[],
	pending: UserTurn
): { summaries: string[]; history: HistoryEntry[] } {
	const position = new Map(path.map((entry, index) => [entry.id, index]));
	// Summaries on this path only, in story order; the latest for a turn wins.
	const onPath = summaries
		.filter((entry) => position.has(entry.turnId))
		.sort((a, b) => (position.get(a.turnId) ?? 0) - (position.get(b.turnId) ?? 0));
	const lastSummarised = onPath.length > 0 ? (position.get(onPath.at(-1)?.turnId ?? '') ?? -1) : -1;
	const history = historyFor(path, pending);
	const passageIndexes = path.flatMap((entry, index) => (isPassage(entry) ? [index] : []));
	const unsummarised = passageIndexes.filter((index) => index > lastSummarised).length;
	const keep = Math.min(MAX_RECENT_PASSAGES, Math.max(RECENT_PASSAGES, unsummarised));
	return {
		summaries: onPath.map((entry) => entry.summary.text),
		history: history.slice(-keep)
	};
}

/** A passage's footer lines. */
export function footerOf(source: string) {
	const footer = findTag(parseMarkup(source, { final: true }), 'after');
	return parseFooter(footer ? plainText(footer.children) : '');
}

function applyNew(
	elements: Map<string, DreamElement>,
	entry: Extract<FooterEntry, { kind: 'new' }>
) {
	if (elements.has(entry.id)) {
		return;
	}
	elements.set(entry.id, {
		id: entry.id,
		type: entry.new,
		name: entry.name,
		also: [],
		shown: true,
		fields: entry.seed ? [{ name: 'seed', text: entry.seed, shown: true }] : [],
		stats: []
	});
}

/** A `set` line moves stats addressed `element.stat`. */
function applySet(
	elements: Map<string, DreamElement>,
	entry: Extract<FooterEntry, { kind: 'set' }>
) {
	for (const [address, value] of Object.entries(entry.set)) {
		const [elementId, statName] = address.split('.');
		const element = elements.get(elementId ?? '');
		const stat = element?.stats.find((candidate) => candidate.name === statName);
		if (!(element && stat)) {
			continue;
		}
		const max = stat.max ?? 100;
		const next =
			stat.kind === 'meter' && typeof value === 'number'
				? Math.min(max, Math.max(0, value))
				: value;
		elements.set(element.id, {
			...element,
			stats: element.stats.map((candidate) =>
				candidate === stat ? { ...candidate, value: next } : candidate
			)
		});
	}
}

/**
 * The elements as they stand at the end of the path: the build's, then for
 * each turn in order, new ones a footer adds, stats it moves, and detail
 * written after it (a card filled in, facts added), the latest winning.
 */
export function elementsAt(
	initial: readonly DreamElement[],
	path: readonly PathTurn[],
	details: readonly { turnId: string; detail: DreamDetail }[]
): DreamElement[] {
	const elements = new Map(initial.map((element) => [element.id, element]));
	for (const entry of path) {
		if (isPassage(entry)) {
			for (const line of footerOf(entry.turn.source).entries) {
				if (line.kind === 'new') {
					applyNew(elements, line);
				} else if (line.kind === 'set') {
					applySet(elements, line);
				}
			}
		}
		for (const { detail } of details.filter((candidate) => candidate.turnId === entry.id)) {
			if (detail.kind === 'element') {
				elements.set(detail.element.id, detail.element);
			}
		}
	}
	return [...elements.values()];
}

/** The `<more>` expansions written on the path, by key: the latest for each. */
export function expansionsAt(
	path: readonly PathTurn[],
	details: readonly { turnId: string; detail: DreamDetail }[]
): Map<string, string> {
	const onPath = new Set(path.map((entry) => entry.id));
	const expansions = new Map<string, string>();
	for (const { turnId, detail } of details) {
		if (onPath.has(turnId) && detail.kind === 'more') {
			expansions.set(detail.key, detail.text);
		}
	}
	return expansions;
}

/** An element that is still only a name and a seed line: its card wants filling in. */
export function needsFilling(element: DreamElement): boolean {
	return element.fields.filter((field) => field.name !== 'seed').length === 0;
}

function endsScene(source: string): boolean {
	return findTags(parseMarkup(source, { final: true }), 'beat').some(
		(beat) => beat.attrs.kind === 'scene'
	);
}

/**
 * A scene that has just ended and has no summary yet: at a scene break
 * (`<beat kind="scene"/>`), or once `SCENE_LENGTH` passages have gone by
 * since the last summary. Returns the scene's passages and the turns it runs
 * between, or null.
 */
export function sceneToSummarise(
	path: readonly PathTurn[],
	summaries: readonly { turnId: string; summary: DreamSummary }[]
): { fromTurnId: string; throughTurnId: string; passages: string[] } | null {
	const last = path.at(-1);
	if (!(last && isPassage(last))) {
		return null;
	}
	const summarised = new Set(summaries.map((entry) => entry.turnId));
	const lastSummaryIndex = path.findLastIndex((entry) => summarised.has(entry.id));
	const scene = path.slice(lastSummaryIndex + 1).filter(isPassage);
	const first = path[lastSummaryIndex + 1];
	if (!first || scene.length === 0) {
		return null;
	}
	if (!(endsScene(last.turn.source) || scene.length >= SCENE_LENGTH)) {
		return null;
	}
	return {
		fromTurnId: first.id,
		throughTurnId: last.id,
		passages: scene.map((entry) => entry.turn.source)
	};
}

/** A passage's words without its footer, which is notes for the model rather than prose. */
export function proseOf(source: string): string {
	const nodes = parseMarkup(source, { final: true });
	return plainText(nodes.filter((node) => !(node.type === 'tag' && node.name === 'after'))).trim();
}

/** Phrases repeated across the last few passages, for "don't reuse". */
export function repeatedAt(path: readonly PathTurn[], passages = 4): string[] {
	const recent = path
		.filter(isPassage)
		.slice(-passages)
		.map((entry) => proseOf(entry.turn.source));
	return repeatedPhrases(recent).map((entry) => entry.phrase);
}
