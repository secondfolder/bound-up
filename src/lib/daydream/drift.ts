/**
 * When the thread offers to bring a daydream's idea up to date with its
 * story (docs/daydreams.md, "When the story moves on"). A passage can say
 * the story has moved on from its setup (`drifted`); the offer goes under
 * the newest one that did, once, and not again until the story has gone a
 * few passages past the last offer the user answered, so it cannot nag.
 *
 * Pure and alias-free.
 */

/** How many passages past an answered offer the next one waits for. */
export const DRIFT_GAP = 5;

/**
 * The passage to offer under, from the story passages on the branch being
 * read, oldest first, and the ones whose offer the user already answered
 * (updated, or "Not now"); null for none.
 */
export function driftOffer(
	passages: readonly { id: string; drifted: string | null }[],
	answered: ReadonlySet<string>
): string | null {
	const newest = passages.findLastIndex((passage) => passage.drifted !== null);
	const offered = passages[newest];
	if (!offered || answered.has(offered.id)) {
		return null;
	}
	const lastAnswered = passages.findLastIndex((passage) => answered.has(passage.id));
	return lastAnswered !== -1 && newest - lastAnswered < DRIFT_GAP ? null : offered.id;
}
