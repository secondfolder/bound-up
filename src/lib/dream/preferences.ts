/**
 * Preferences (docs/dreams.md, "Preferences"): one store from "I like
 * surprises" to hard limits, each with a firmness and a scope. Story ones are
 * saved with the daydream's setup; general ones are the user's own
 * (`dream-preferences`).
 *
 * When unsure, a preference is saved for this story only: one wrongly saved
 * as general shapes every future story without the user noticing, while one
 * wrongly kept to a story just has to be said again. Making one general
 * always takes the user's tap.
 *
 * Pure and alias-free.
 */

import type { DreamPreference, DreamSetup } from '../sealed-kinds/dreams';
import type { FooterEntry } from './footer';

const MAX_TEXT = 200;
const SPACE = /\s+/g;

/** Two preferences are the same when their words are, whatever the case and spacing. */
export function samePreference(a: string, b: string): boolean {
	return normalise(a) === normalise(b);
}

function normalise(text: string): string {
	return text.toLowerCase().replace(SPACE, ' ').trim();
}

function preferenceId(random: () => number): string {
	return Math.floor(random() * 36 ** 8)
		.toString(36)
		.padStart(8, '0');
}

/** A preference the model noticed in the footer, for this story only. */
export function preferenceFromFooter(
	line: Extract<FooterEntry, { kind: 'pref' }>,
	random: () => number
): DreamPreference {
	return {
		id: preferenceId(random),
		text: line.pref.slice(0, MAX_TEXT),
		firmness: line.firmness === 'hard' ? 'default' : line.firmness,
		appliesTo: '',
		source: 'noticed'
	};
}

/**
 * A question's answer the user asked to remember. Never a hard limit: a
 * limit is something the user says plainly, not a tap on an option.
 */
export function preferenceFromAnswer(
	question: string,
	answer: string,
	random: () => number
): DreamPreference {
	const text = `${question.trim()} ${answer.trim()}`;
	return {
		id: preferenceId(random),
		text: text.slice(0, MAX_TEXT),
		firmness: 'default',
		appliesTo: '',
		source: 'answer'
	};
}

/** Adds a preference unless one with the same words is already there. */
export function withPreference(
	list: readonly DreamPreference[],
	preference: DreamPreference
): DreamPreference[] {
	return list.some((entry) => samePreference(entry.text, preference.text))
		? [...list]
		: [...list, preference];
}

export function withoutPreference(list: readonly DreamPreference[], id: string): DreamPreference[] {
	return list.filter((entry) => entry.id !== id);
}

/** In this many daydreams, a story preference is worth suggesting as general. */
export const PROMOTE_AFTER = 3;

/**
 * Story preferences that turn up in at least `PROMOTE_AFTER` daydreams and
 * are not general yet, to suggest making general. Never made general without
 * the user's tap.
 */
export function promotable(
	setups: readonly DreamSetup[],
	general: readonly DreamPreference[]
): DreamPreference[] {
	const counts = new Map<string, { preference: DreamPreference; count: number }>();
	for (const setup of setups) {
		const seen = new Set<string>();
		for (const preference of setup.preferences) {
			const key = normalise(preference.text);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			const entry = counts.get(key) ?? { preference, count: 0 };
			entry.count += 1;
			counts.set(key, entry);
		}
	}
	return [...counts.values()]
		.filter((entry) => entry.count >= PROMOTE_AFTER)
		.filter((entry) => !general.some((other) => samePreference(other.text, entry.preference.text)))
		.map((entry) => entry.preference);
}
