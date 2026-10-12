/**
 * A seeded random source, so a run is reproducible from one number.
 *
 * `Math.random` would do for play, but the seed is stored with each result and
 * the generators are tested by seed: the same seed has to give the same
 * questions on the server, in a test and in any browser.
 */

export type Rng = {
	/** A float in [0, 1). */
	next: () => number;
	/** An integer in [min, max], both inclusive. */
	int: (min: number, max: number) => number;
	/** One element of a non-empty list. */
	pick: <T>(items: readonly T[]) => T;
	/** A shuffled copy; the input is left alone. */
	shuffle: <T>(items: readonly T[]) => T[];
	/** `count` distinct elements, in random order. */
	sample: <T>(items: readonly T[], count: number) => T[];
	/** True with the given probability. */
	chance: (probability: number) => boolean;
};

/**
 * mulberry32: tiny, fast, and good enough to deal questions.
 *
 * Not for anything secret — the seed is in the stored result for anyone to see.
 */
export function createRng(seed: number): Rng {
	let state = seed >>> 0;
	const next = () => {
		state = (state + 0x6d_2b_79_f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
	const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
	const shuffle = <T>(items: readonly T[]): T[] => {
		const copy = [...items];
		for (let i = copy.length - 1; i > 0; i -= 1) {
			const j = int(0, i);
			[copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
		}
		return copy;
	};
	return {
		next,
		int,
		pick: <T>(items: readonly T[]): T => {
			if (items.length === 0) {
				throw new Error('pick() was given an empty list');
			}
			return items[int(0, items.length - 1)] as T;
		},
		shuffle,
		sample: <T>(items: readonly T[], count: number): T[] => {
			if (count > items.length) {
				throw new Error(`sample() asked for ${count} of ${items.length} items`);
			}
			return shuffle(items).slice(0, count);
		},
		chance: (probability: number) => next() < probability
	};
}

/** A fresh seed for a new run. Any 32-bit value is a valid one. */
export function newSeed(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/**
 * One seed out of several numbers, so each question slot gets a random source
 * of its own: what slot 14 deals no longer depends on how many numbers the
 * slots before it happened to draw, which it would if they shared one stream.
 * A murmur3-style finaliser over each part in turn; any 32-bit inputs.
 */
export function mixSeed(...parts: readonly number[]): number {
	let hash = 0x9e_37_79_b9;
	for (const part of parts) {
		hash = Math.imul(hash ^ (part >>> 0), 0x85_eb_ca_6b);
		hash ^= hash >>> 13;
		hash = Math.imul(hash, 0xc2_b2_ae_35);
		hash ^= hash >>> 16;
	}
	return hash >>> 0;
}
