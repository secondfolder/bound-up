import { userEvent } from 'vitest/browser';

/**
 * Types one key at a time, pausing between them, so a form's validation runs
 * after each key the way it does for a person typing. Real, trusted keystrokes
 * through Playwright, for the browser project only.
 */
export async function typeSlowly(field: Element, text: string) {
	for (const key of text) {
		await userEvent.type(field, key === ' ' ? '{Space}' : key);
		await new Promise((resolve) => setTimeout(resolve, 30));
	}
}

/**
 * The timeout for a test that types with `typeSlowly`, in place of the browser
 * project's default 15 seconds.
 *
 * Each key is two round trips from the page to Playwright and back (a focus,
 * then the key), and those slow down sharply when the whole suite runs: the
 * browser project runs its files in parallel in one Chromium, alongside the
 * node project. A test typing thirty keys took 2 seconds alone, 8 to 10 within
 * `vitest run`, and over 15 — failing — with another checkout's suite running
 * beside it. The time is spent waiting, not working, so a longer budget hides
 * nothing.
 */
export const TYPE_SLOWLY_TIMEOUT = 60_000;
