/**
 * Chips: suggestions that edit free text rather than replacing it.
 *
 * Every character and scene field is free text, because that is what the
 * model reads and what a person can always rewrite. A chip is a phrase that
 * toggles in that text: tapping "patient" adds it to the personality field,
 * tapping it again takes it out, and whatever else the person wrote there
 * stays exactly as it was. A field reads as a list of phrases separated by
 * commas or lines, which is also how people tend to write these anyway.
 *
 * Pure and alias-free.
 */

import type { CopySource } from '../daydream';

const SEPARATOR = /[,\n]/;
/** The same, kept by `split`, so phrases and separators alternate. */
const KEPT_SEPARATOR = /(?<separator>[,\n])/;
const TRAILING_SPACES = /[ \t]+$/;
const LEADING_SPACES = /^ +/;

/** The phrases in a field, trimmed, in order. */
function items(text: string): string[] {
	return text
		.split(SEPARATOR)
		.map((item) => item.trim())
		.filter((item) => item !== '');
}

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export function hasChip(text: string, chip: string): boolean {
	return items(text).some((item) => same(item, chip.trim()));
}

/**
 * Adds the chip to the end of the field, or takes it out if it is there.
 *
 * Removal cuts the phrase and the separator before it (or after it, for the
 * first), and leaves everything else byte for byte, so a person's own
 * sentences and line breaks survive any number of taps.
 */
export function toggleChip(text: string, chip: string): string {
	const phrase = chip.trim();
	if (phrase === '') {
		return text;
	}
	if (!hasChip(text, phrase)) {
		// Spaces only: a trailing line break is the person starting a new line.
		const body = text.replace(TRAILING_SPACES, '');
		if (body.trim() === '') {
			return phrase;
		}
		if (body.endsWith('\n')) {
			return `${body}${phrase}`;
		}
		return body.endsWith(',') ? `${body} ${phrase}` : `${body}, ${phrase}`;
	}
	// Phrases at the even indexes, the separators between them at the odd ones.
	const tokens = text.split(KEPT_SEPARATOR);
	const at = tokens.findIndex((token, index) => index % 2 === 0 && same(token.trim(), phrase));
	if (at > 0) {
		// Drop it with the separator in front of it.
		tokens.splice(at - 1, 2);
	} else {
		// The first phrase: drop it with the separator after it, and the space
		// that followed that separator.
		tokens.splice(0, 2);
		tokens[0] = (tokens[0] ?? '').replace(LEADING_SPACES, '');
	}
	return tokens.join('').trim();
}

/** Model chips merged after curated ones, without repeating a phrase already offered. */
export function mergeChips(curated: readonly string[], extra: readonly string[]): string[] {
	const merged = [...curated];
	for (const chip of extra) {
		if (!merged.some((existing) => same(existing, chip))) {
			merged.push(chip);
		}
	}
	return merged;
}

/**
 * How a daydream's copy of a character or scene stands against the library.
 *
 * Compared by the library row's plaintext `revision`, which every edit
 * bumps, so a page can tell the library has moved on without opening
 * anything.
 *
 * - `unsaved`: the copy has no library record (from a v1 setup, or made
 *   without saving), so it can be saved to the library.
 * - `missing`: its record was deleted from the library. The copy carries on.
 * - `updated`: the record has been edited since it was copied.
 */
export type CopyState = 'in-sync' | 'updated' | 'missing' | 'unsaved';

export function copyState(
	copy: CopySource,
	library: ReadonlyMap<string, { revision: number }>
): CopyState {
	if (copy.sourceId === null) {
		return 'unsaved';
	}
	const row = library.get(copy.sourceId);
	if (!row) {
		return 'missing';
	}
	return row.revision === copy.sourceRevision ? 'in-sync' : 'updated';
}
