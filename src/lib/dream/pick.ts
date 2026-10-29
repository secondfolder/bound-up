/**
 * Picking a direction (docs/dreams.md, "Picking a direction").
 *
 * Each direction is weighted by its likelihood raised to a power set by the
 * spread: a narrow brief follows the model's own likelihoods, a wide one
 * flattens them so the less obvious directions win more often. That tilt is
 * the point of listing directions at all: asked for one answer, a model gives
 * the most typical one every time (Verbalized Sampling, arXiv 2510.01171).
 *
 * Pure and alias-free.
 */

import { type Random, weightedIndex } from './random';
import type { Direction } from './reading';

/** How far a spread flattens the model's likelihoods: 1 keeps them, 0 ignores them. */
export function tiltFor(spread: number): number {
	if (spread <= 3) {
		return 1;
	}
	return spread <= 5 ? 0.6 : 0.35;
}

/** The direction to build, or null when none are left to pick from. */
export function pickDirection(
	directions: readonly Direction[],
	spread: number,
	random: Random,
	exclude: ReadonlySet<string> = new Set()
): Direction | null {
	const pool = directions.filter((direction) => !exclude.has(direction.id));
	if (pool.length <= 1 || spread <= 1) {
		return pool[0] ?? null;
	}
	const tilt = tiltFor(spread);
	const weights = pool.map((direction) => Math.max(direction.p, 0.01) ** tilt);
	return pool[weightedIndex(weights, random)] ?? null;
}
