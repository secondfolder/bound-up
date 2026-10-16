/**
 * Quotes: stretches of a passage, by offset, for highlighted bookmarks and
 * for "more of this", "rewrite this" and "not this".
 *
 * Offsets into the passage's text, which never changes once written, so a
 * quote saved today still points at the same words next year. A quote whose
 * offsets no longer match its text (which only a corrupt record could make)
 * is not highlighted rather than highlighting the wrong words.
 *
 * Pure and alias-free.
 */

import type { Quote } from '../sealed-kinds/daydreams';

const SPACE = /\s/;

export type Segment = { text: string; marked: boolean };

/** The passage cut into marked and unmarked runs, overlapping quotes merged. */
export function highlightSegments(text: string, quotes: readonly Quote[]): Segment[] {
	const ranges = quotes
		.filter((quote) => text.slice(quote.start, quote.end) === quote.text)
		.map((quote) => [quote.start, quote.end] as const)
		.sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [];
	for (const [start, end] of ranges) {
		const last = merged.at(-1);
		if (last && start <= last[1]) {
			last[1] = Math.max(last[1], end);
		} else {
			merged.push([start, end]);
		}
	}
	const segments: Segment[] = [];
	let at = 0;
	for (const [start, end] of merged) {
		if (start > at) {
			segments.push({ text: text.slice(at, start), marked: false });
		}
		segments.push({ text: text.slice(start, end), marked: true });
		at = end;
	}
	if (at < text.length || segments.length === 0) {
		segments.push({ text: text.slice(at), marked: false });
	}
	return segments;
}

/**
 * A quote from offsets into `text`, trimmed of surrounding whitespace so a
 * sloppy drag still quotes the words, or null for a selection with no words
 * in it.
 */
export function quoteAt(text: string, start: number, end: number): Quote | null {
	let from = Math.max(0, Math.min(start, end));
	let to = Math.min(text.length, Math.max(start, end));
	while (from < to && SPACE.test(text[from] ?? '')) {
		from += 1;
	}
	while (to > from && SPACE.test(text[to - 1] ?? '')) {
		to -= 1;
	}
	if (to <= from) {
		return null;
	}
	const quoted = text.slice(from, to);
	return quoted.length > 1000 ? null : { start: from, end: to, text: quoted };
}
