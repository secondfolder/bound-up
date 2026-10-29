/**
 * The variety fingerprint (docs/dreams.md, "Quality tools"): a cheap model
 * reduces a run to a few fields, so variety can be counted in words a person
 * reads ("11 of 20 runs were set in a studio") instead of an opaque distance.
 *
 * Alias-free, for the bench.
 */

import { z } from 'zod';
import type { ModelMessage } from '../prompts/core';

export const FINGERPRINT_FIELDS = [
	'setting',
	'power',
	'form',
	'userRole',
	'hook',
	'opening'
] as const;

const fingerprintSchema = z.object({
	setting: z.string().max(80),
	power: z.string().max(80),
	form: z.string().max(80),
	userRole: z.string().max(80),
	hook: z.string().max(120),
	opening: z.string().max(120)
});

export type Fingerprint = z.output<typeof fingerprintSchema>;

export function fingerprintMessages(build: string, opening: string): ModelMessage[] {
	return [
		{
			role: 'system',
			content: `You summarise a story setup in a few words per field, so many setups can be compared. Reply with only a JSON object with these keys, each a short phrase of at most eight words, in plain lower case:
"setting": where it takes place, as a kind of place ("a restaurant after close"),
"power": who holds power over whom, and why,
"form": how it is told ("prose", "weekly reports", "text messages"),
"userRole": who the user is in it,
"hook": what makes this one particular,
"opening": what happens in the first passage.`
		},
		{ role: 'user', content: `<setup>\n${build}\n</setup>\n\n<opening>\n${opening}\n</opening>` }
	];
}

const JSON_OBJECT = /\{[\s\S]*\}/;

/** Reads the fingerprint, or null when the reply is not one. */
export function parseFingerprint(text: string): Fingerprint | null {
	const match: RegExpExecArray | null = JSON_OBJECT.exec(text);
	if (!match) {
		return null;
	}
	try {
		const parsed = fingerprintSchema.safeParse(JSON.parse(match[0]));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

/** How many runs share each value of each field, most common first. */
export function fingerprintSpread(
	fingerprints: readonly Fingerprint[]
): Record<(typeof FINGERPRINT_FIELDS)[number], [string, number][]> {
	const spread = {} as Record<(typeof FINGERPRINT_FIELDS)[number], [string, number][]>;
	for (const field of FINGERPRINT_FIELDS) {
		const counts = new Map<string, number>();
		for (const fingerprint of fingerprints) {
			const value = fingerprint[field].toLowerCase().trim();
			counts.set(value, (counts.get(value) ?? 0) + 1);
		}
		spread[field] = [...counts].sort((a, b) => b[1] - a[1]);
	}
	return spread;
}
