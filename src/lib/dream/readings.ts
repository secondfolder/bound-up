/**
 * How a user's words are meant (docs/dreams.md, "How a turn is read"), from
 * the first engine's readings: something they say or do in the story, a
 * direction for where it goes, an instruction for their own turn (which the
 * model writes out for them), part of the story itself, or out of character.
 *
 * The model says how it read a turn first, before the passage, as
 * `<reading as="…"/>`, and writes an instruction out in `<yours>`; the page
 * draws the turn to match. The user can read it differently, which forks the
 * story with that reading kept, and sent from then on.
 *
 * Pure and alias-free.
 */

import { findTag, parseMarkup, plainText } from './markup';

export const READINGS = ['action', 'direction', 'instruction', 'story', 'ooc'] as const;

export type Reading = (typeof READINGS)[number];

export function isReading(value: unknown): value is Reading {
	return typeof value === 'string' && (READINGS as readonly string[]).includes(value);
}

/** How a turn was read, and the turn written out: tags any passage may start with. */
export const TURN_TAGS: ReadonlySet<string> = new Set(['reading', 'yours']);

/** Each reading as the user chooses it ("Read it differently"). */
export const READING_CHOICES: Readonly<Record<Reading, string>> = {
	action: 'Something I say or do',
	direction: 'A direction for the story',
	instruction: 'Write my turn out for me',
	story: 'Part of the story',
	ooc: 'Out of character'
};

/** Out-of-character syntax, which is always read so whatever the model would make of it. */
const OUT_OF_CHARACTER = /^\s*(?:\(|\[|\/\/|ooc\s*:)/i;

export function explicitOoc(text: string): boolean {
	return OUT_OF_CHARACTER.test(text);
}

/** How a passage read the turn before it, and that turn written out, if it was. */
export function turnReading(source: string): { reading: Reading | null; yours: string | null } {
	const nodes = parseMarkup(source, { final: true });
	const as = findTag(nodes, 'reading')?.attrs.as?.trim().toLowerCase();
	const yours = findTag(nodes, 'yours');
	const written = yours ? plainText(yours.children).trim() : '';
	return { reading: isReading(as) ? as : null, yours: written || null };
}
