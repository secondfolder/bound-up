import { describe, expect, it } from 'vitest';
import { coversEveryFace, outcomeFor, type RandomSource, roll } from './dice';

/** A random source that hands out the given values in turn. */
function fixed(...values: number[]): RandomSource {
	let index = 0;
	return (buffer) => {
		buffer[0] = values[index % values.length] ?? 0;
		index += 1;
		return buffer;
	};
}

describe('roll', () => {
	it('lands on every face of a die and nowhere else', () => {
		for (const sides of [2, 6, 20]) {
			const seen = new Set<number>();
			for (let value = 0; value < sides * 3; value += 1) {
				seen.add(roll(sides, fixed(value)));
			}
			expect([...seen].sort((a, b) => a - b)).toEqual(
				Array.from({ length: sides }, (_, index) => index + 1)
			);
		}
	});

	it('draws again from the uneven top slice rather than favouring low faces', () => {
		// 2^32 = 6 × 715827882 + 4: the top 4 values would make faces 1–4 likelier.
		const top = 2 ** 32 - 1;
		expect(roll(6, fixed(top, 5))).toBe(6);
	});

	it('refuses a die that is not one', () => {
		expect(() => roll(1)).toThrow(RangeError);
		expect(() => roll(21)).toThrow(RangeError);
		expect(() => roll(2.5)).toThrow(RangeError);
	});

	it('uses real randomness by default', () => {
		const result = roll(20);
		expect(result).toBeGreaterThanOrEqual(1);
		expect(result).toBeLessThanOrEqual(20);
	});
});

describe('coversEveryFace', () => {
	const outcomes = (...ranges: [number, number][]) =>
		ranges.map(([min, max]) => ({ min, max, label: `${min}-${max}` }));

	it('accepts outcomes that cover each face exactly once', () => {
		expect(coversEveryFace({ sides: 6, outcomes: outcomes([1, 3], [4, 6]) })).toBe(true);
		expect(coversEveryFace({ sides: 2, outcomes: outcomes([2, 2], [1, 1]) })).toBe(true);
	});

	it('refuses a gap, an overlap, or a face off the die', () => {
		expect(coversEveryFace({ sides: 6, outcomes: outcomes([1, 3], [5, 6]) })).toBe(false);
		expect(coversEveryFace({ sides: 6, outcomes: outcomes([1, 4], [4, 6]) })).toBe(false);
		expect(coversEveryFace({ sides: 6, outcomes: outcomes([0, 3], [4, 6]) })).toBe(false);
		expect(coversEveryFace({ sides: 6, outcomes: outcomes([1, 3], [4, 7]) })).toBe(false);
		expect(coversEveryFace({ sides: 6, outcomes: outcomes([4, 1], [5, 6]) })).toBe(false);
		expect(coversEveryFace({ sides: 1, outcomes: outcomes([1, 1]) })).toBe(false);
	});
});

describe('outcomeFor', () => {
	it('finds the outcome a face lands on', () => {
		const proposal = {
			prompt: 'Roll',
			sides: 6,
			outcomes: [
				{ min: 1, max: 3, label: 'You move' },
				{ min: 4, max: 6, label: 'You hold' }
			]
		};
		expect(outcomeFor(proposal, 3)?.label).toBe('You move');
		expect(outcomeFor(proposal, 4)?.label).toBe('You hold');
		expect(outcomeFor(proposal, 7)).toBeNull();
	});
});
