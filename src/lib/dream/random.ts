/**
 * Randomness from code, because a model cannot surprise itself
 * (docs/dreams.md, "Principles"): picking a direction, drawing nudges.
 *
 * Every draw takes a `Random`, so the bench can seed it and compare two
 * prompt versions on identical draws, and the app can use
 * `crypto.getRandomValues`.
 *
 * Pure and alias-free.
 */

/** A number in [0, 1). */
export type Random = () => number;

const UINT32 = 2 ** 32;

/** Cryptographic randomness, for the app. */
export function cryptoRandom(): number {
	const values = new Uint32Array(1);
	crypto.getRandomValues(values);
	return (values[0] ?? 0) / UINT32;
}

/** mulberry32: small, fast and seedable, for the bench. Not for anything secret. */
export function seededRandom(seed: number): Random {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d_2b_79_f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / UINT32;
	};
}

/** A string to a seed, so a bench run can be named rather than numbered. */
export function seedFrom(text: string): number {
	let hash = 2_166_136_261;
	for (const char of text) {
		hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16_777_619);
	}
	return hash >>> 0;
}

/** An index drawn in proportion to `weights`. */
export function weightedIndex(weights: readonly number[], random: Random): number {
	const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
	if (total <= 0) {
		return Math.floor(random() * weights.length);
	}
	let target = random() * total;
	for (const [index, weight] of weights.entries()) {
		target -= Math.max(0, weight);
		if (target < 0) {
			return index;
		}
	}
	return weights.length - 1;
}

/** `count` distinct items, without replacement. */
export function drawDistinct<T>(items: readonly T[], count: number, random: Random): T[] {
	const pool = [...items];
	const drawn: T[] = [];
	while (drawn.length < count && pool.length > 0) {
		const [item] = pool.splice(Math.floor(random() * pool.length), 1);
		if (item !== undefined) {
			drawn.push(item);
		}
	}
	return drawn;
}
