/**
 * A passage's `<after>` footer: one JSON object per line, read line by line
 * so a malformed line is lost on its own (docs/dreams.md, "Playing").
 *
 * Every line is untrusted: it is checked against its own schema, and what
 * fails is dropped and counted, never guessed at.
 *
 * Pure and alias-free.
 */

import { z } from 'zod';

const ID = /^[\w-]{1,40}$/;
/** At most this many suggestions under a passage. */
export const MAX_SUGGESTIONS = 4;

const nextLine = z.object({ next: z.string().trim().min(1).max(400) });

const newLine = z.object({
	new: z.string().trim().min(1).max(40),
	id: z.string().regex(ID),
	name: z.string().trim().min(1).max(80),
	seed: z.string().trim().max(400).default('')
});

const prefLine = z.object({
	pref: z.string().trim().min(1).max(200),
	scope: z.enum(['story', 'general']).default('story'),
	firmness: z.enum(['hard', 'default', 'leaning']).default('leaning'),
	why: z.string().trim().max(200).optional()
});

const setLine = z.object({
	set: z.record(z.string().max(80), z.union([z.number(), z.string().max(200)]))
});

const tellingLine = z.object({ telling: z.string().trim().min(1).max(2000) });

/** Things the user might write next, offered under the newest passage (docs/dreams.md, "Suggestions"). */
const suggestLine = z.object({
	suggest: z.array(z.string().trim().min(1).max(200)).min(1).max(MAX_SUGGESTIONS)
});

export type FooterEntry =
	| ({ kind: 'next' } & z.output<typeof nextLine>)
	| ({ kind: 'new' } & z.output<typeof newLine>)
	| ({ kind: 'pref' } & z.output<typeof prefLine>)
	| ({ kind: 'set' } & z.output<typeof setLine>)
	| ({ kind: 'telling' } & z.output<typeof tellingLine>)
	| ({ kind: 'suggest' } & z.output<typeof suggestLine>);

export type Footer = { entries: FooterEntry[]; dropped: number };

function readLine(value: unknown): FooterEntry | null {
	if (typeof value !== 'object' || value === null) {
		return null;
	}
	if ('next' in value) {
		const parsed = nextLine.safeParse(value);
		return parsed.success ? { kind: 'next', ...parsed.data } : null;
	}
	if ('new' in value) {
		const parsed = newLine.safeParse(value);
		return parsed.success ? { kind: 'new', ...parsed.data } : null;
	}
	if ('pref' in value) {
		const parsed = prefLine.safeParse(value);
		return parsed.success ? { kind: 'pref', ...parsed.data } : null;
	}
	if ('set' in value) {
		const parsed = setLine.safeParse(value);
		return parsed.success ? { kind: 'set', ...parsed.data } : null;
	}
	if ('suggest' in value) {
		const parsed = suggestLine.safeParse(value);
		return parsed.success ? { kind: 'suggest', ...parsed.data } : null;
	}
	if ('telling' in value) {
		const parsed = tellingLine.safeParse(value);
		return parsed.success ? { kind: 'telling', ...parsed.data } : null;
	}
	return null;
}

function parseJson(line: string): unknown {
	try {
		return JSON.parse(line);
	} catch {
		return null;
	}
}

/** Reads a footer's text (the raw content of `<after>`). */
export function parseFooter(text: string): Footer {
	const entries: FooterEntry[] = [];
	let dropped = 0;
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		// Bench examples annotate footers with `//` comments; a model copying one is harmless.
		if (!line || line.startsWith('//')) {
			continue;
		}
		const entry = readLine(parseJson(line));
		if (entry) {
			entries.push(entry);
		} else {
			dropped += 1;
		}
	}
	return { entries, dropped };
}

/** The passage's next-step note, the last one if the model wrote several. */
export function nextNote(footer: Footer): string | null {
	let note: string | null = null;
	for (const entry of footer.entries) {
		if (entry.kind === 'next') {
			note = entry.next;
		}
	}
	return note;
}

/** The passage's suggestions for what the user might write next: the last line of them, each once. */
export function suggestionsIn(footer: Footer): string[] {
	let found: string[] = [];
	for (const entry of footer.entries) {
		if (entry.kind === 'suggest') {
			found = entry.suggest;
		}
	}
	return [...new Set(found)];
}
