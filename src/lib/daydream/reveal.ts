/**
 * The pace a passage is shown at while it arrives (`reveal.svelte.ts`).
 *
 * A provider streams in bursts — nothing for a moment, then a sentence at
 * once — which reads as jerky, and the eye keeps losing its place. So the
 * page shows the text at a steady pace instead, never far behind what has
 * arrived: the further behind it is, the faster it goes — at the rate that
 * would catch up in `CATCH_UP_SECONDS`, so the gap shrinks by about two
 * thirds every `CATCH_UP_SECONDS` — and never slower than `MIN_RATE`. A
 * typical burst, a few words, is caught up with in a fraction of a second.
 * It only smooths; it does not hold the story back to a reading speed.
 *
 * Pure and alias-free.
 */

/** Characters a second, at the slowest: a little faster than anyone reads. */
export const MIN_RATE = 90;
/** The gap's time constant: how quickly it shrinks. */
export const CATCH_UP_SECONDS = 0.35;

/**
 * How far into the text to show after `elapsed` milliseconds, from `shown`
 * (fractional: whole characters are taken off it with `cutAt`).
 */
export function revealStep(shown: number, target: number, elapsed: number): number {
	if (shown >= target) {
		return target;
	}
	const rate = Math.max(MIN_RATE, (target - shown) / CATCH_UP_SECONDS);
	return Math.min(target, shown + (rate * Math.max(0, elapsed)) / 1000);
}

/** Where to cut `text` near `at` without splitting a surrogate pair, which would draw as a broken glyph. */
export function cutAt(text: string, at: number): number {
	const whole = Math.max(0, Math.min(text.length, Math.floor(at)));
	const code = text.charCodeAt(whole - 1);
	return code >= 0xd8_00 && code <= 0xdb_ff ? whole + 1 : whole;
}

/** How much of `before` is still the start of `after`: what can stay shown when the text changes. */
export function sharedStart(before: string, after: string): number {
	let index = 0;
	while (index < before.length && before[index] === after[index]) {
		index += 1;
	}
	return index;
}
