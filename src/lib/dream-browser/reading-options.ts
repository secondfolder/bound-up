/**
 * How the user likes daydreams read aloud, on this device (docs/dreams.md,
 * "Read aloud"): whether read aloud is on, and the player's options. One
 * set for every daydream, since they are the reader's habits rather than a
 * story's, and in local storage: a convenience, so storage that is not
 * there only means starting from the defaults.
 */

import { SPEEDS } from './reader.svelte';

export type ReadingOptions = {
	listening: boolean;
	readNew: boolean;
	highlight: boolean;
	keepGoing: boolean;
	rate: number;
};

export const DEFAULT_READING_OPTIONS: ReadingOptions = {
	listening: false,
	readNew: false,
	highlight: true,
	keepGoing: false,
	rate: 1
};

const KEY = 'dream-reading-options';

/**
 * Options from what storage held: each one kept only if it is the right
 * shape, so one written by an older build (or by hand) costs only itself.
 */
export function readReadingOptions(stored: unknown): ReadingOptions {
	const options = { ...DEFAULT_READING_OPTIONS };
	if (typeof stored !== 'object' || stored === null) {
		return options;
	}
	const record = stored as Record<string, unknown>;
	for (const flag of ['listening', 'readNew', 'highlight', 'keepGoing'] as const) {
		const value = record[flag];
		if (typeof value === 'boolean') {
			options[flag] = value;
		}
	}
	const { rate } = record;
	if (typeof rate === 'number' && (SPEEDS as readonly number[]).includes(rate)) {
		options.rate = rate;
	}
	return options;
}

export function loadReadingOptions(): ReadingOptions {
	try {
		return readReadingOptions(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
	} catch {
		// Unreadable, or storage refused (a private window): the defaults.
		return { ...DEFAULT_READING_OPTIONS };
	}
}

export function saveReadingOptions(options: ReadingOptions): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(options));
	} catch {
		// Storage refused: they only last as long as the page.
	}
}
