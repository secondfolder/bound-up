import { fileURLToPath } from 'node:url';

/**
 * Helpers for the Affinity reference tests (`halftone.test.ts`,
 * `grain.test.ts`). Node-only: fixture paths are resolved on disk.
 */

/** A PNG under `testing/halftone-fixtures/<group>/`. */
export function halftoneFixturePath(group: string, fileName: string): string {
	return fileURLToPath(new URL(`./halftone-fixtures/${group}/${fileName}`, import.meta.url));
}

export function statsOf(values: ArrayLike<number>): {
	min: number;
	max: number;
	mean: number;
	std: number;
} {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	let sum = 0;
	for (const value of Array.from(values)) {
		min = Math.min(min, value);
		max = Math.max(max, value);
		sum += value;
	}
	const mean = sum / values.length;
	let variance = 0;
	for (const value of Array.from(values)) {
		variance += (value - mean) ** 2;
	}
	return { min, max, mean, std: Math.sqrt(variance / values.length) };
}
