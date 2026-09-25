import { describe, expect, it } from 'vitest';
import { applyMonochromeGrainRgb, grainDelta } from './grain';
import { halftoneFixturePath, statsOf } from './testing/fixture-stats';
import { decodePngToNormalizedImage } from './testing/png';

/**
 * The grain model. The GPU half is compared against these functions in
 * `GrainEffect.svelte.test.ts`; here are the properties of the CPU half.
 */
describe('the grain model', () => {
	it('produces spatially white grain', () => {
		// The statistical comparison against the noise reference below only
		// checks the distribution, which a badly structured hash passes happily:
		// the sine hash it replaced had the right histogram and visible vertical
		// streaks. These assertions are about *arrangement*.
		//
		// The field straddles the origin because the grain is measured from
		// the image centre, so half of every real image hashes negative
		// coordinates.
		const size = 192;
		const half = size / 2;
		const field = new Float64Array(size * size);
		for (let y = 0; y < size; y += 1) {
			for (let x = 0; x < size; x += 1) {
				field[y * size + x] = grainDelta(x + 0.5 - half, y + 0.5 - half, 1);
			}
		}
		const mean = field.reduce((sum, value) => sum + value, 0) / field.length;
		const variance = field.reduce((sum, value) => sum + (value - mean) ** 2, 0) / field.length;
		const standardDeviation = Math.sqrt(variance);

		// Triangular over ±40/255 has sd (40/255)/sqrt(6).
		expect(mean).toBeCloseTo(0, 2);
		expect(standardDeviation).toBeCloseTo(40 / 255 / Math.sqrt(6), 2);

		const autocorrelation = (dx: number, dy: number) => {
			let sum = 0;
			let count = 0;
			for (let y = 0; y < size - dy; y += 1) {
				for (let x = 0; x < size - dx; x += 1) {
					sum += (field[y * size + x] - mean) * (field[(y + dy) * size + x + dx] - mean);
					count += 1;
				}
			}
			return sum / count / variance;
		};
		for (const [dx, dy] of [
			[1, 0],
			[0, 1],
			[1, 1],
			[2, 0],
			[0, 2],
			[7, 3]
		]) {
			expect(Math.abs(autocorrelation(dx, dy)), `lag ${dx},${dy}`).toBeLessThan(0.05);
		}

		// Streaking shows up as row or column means that vary further than
		// averaging `size` independent samples could explain.
		const lineMean = (index: number, alongRow: boolean) => {
			let sum = 0;
			for (let step = 0; step < size; step += 1) {
				sum += field[alongRow ? index * size + step : step * size + index];
			}
			return sum / size;
		};
		for (const alongRow of [true, false]) {
			const means = Array.from({ length: size }, (_, index) => lineMean(index, alongRow));
			const meanOfMeans = means.reduce((sum, value) => sum + value, 0) / means.length;
			const spread = Math.sqrt(
				means.reduce((sum, value) => sum + (value - meanOfMeans) ** 2, 0) / means.length
			);
			expect(
				spread / (standardDeviation / Math.sqrt(size)),
				alongRow ? 'rows' : 'columns'
			).toBeLessThan(1.5);
		}

		// And no symmetry about the origin. fract(-a) is 1 - fract(a), so a
		// hash that leaned on it would mirror the grain either side of the
		// page centre — invisible to every check above, obvious on screen.
		const mirrorCorrelation = (mirrorX: boolean, mirrorY: boolean) => {
			let sum = 0;
			// Index size - 1 - x holds the coordinate -(x + 0.5 - half).
			for (let y = 0; y < size; y += 1) {
				for (let x = 0; x < size; x += 1) {
					const mirrored =
						field[(mirrorY ? size - 1 - y : y) * size + (mirrorX ? size - 1 - x : x)];
					sum += (field[y * size + x] - mean) * (mirrored - mean);
				}
			}
			return sum / field.length / variance;
		};
		for (const [mirrorX, mirrorY] of [
			[true, false],
			[false, true],
			[true, true]
		] as const) {
			expect(
				Math.abs(mirrorCorrelation(mirrorX, mirrorY)),
				`mirror ${mirrorX ? 'x' : ''}${mirrorY ? 'y' : ''}`
			).toBeLessThan(0.05);
		}
	});
});

describe('grain reference regressions', () => {
	it('matches the 50 percent monochrome noise reference statistically', () => {
		const base = decodePngToNormalizedImage(halftoneFixturePath('noise', 'no-noise.png'));
		const expected = decodePngToNormalizedImage(
			halftoneFixturePath('noise', '50-percent-noise.png')
		);
		// The reference source is solid #FFC621, so red is already at 255: every
		// positive delta clips there and the channel's statistics say more about
		// Affinity's clipping than about its grain. Green and blue are clear of
		// both ends and carry the assertions.
		const channels = [0, 1, 2].map(() => ({ actual: [] as number[], expected: [] as number[] }));
		for (let y = 0; y < base.height; y += 1) {
			for (let x = 0; x < base.width; x += 1) {
				const index = (y * base.width + x) * 4;
				const noised = applyMonochromeGrainRgb(
					base.rgba[index],
					base.rgba[index + 1],
					base.rgba[index + 2],
					x + 0.5,
					y + 0.5,
					0.5
				);
				for (let channel = 0; channel < 3; channel += 1) {
					channels[channel].actual.push(noised[channel] - base.rgba[index + channel]);
					channels[channel].expected.push(
						expected.rgba[index + channel] - base.rgba[index + channel]
					);
				}
			}
		}
		for (const [channel, name] of [
			[1, 'green'],
			[2, 'blue']
		] as const) {
			const actual = statsOf(channels[channel].actual);
			const reference = statsOf(channels[channel].expected);
			expect(Math.abs(actual.mean - reference.mean), `${name} mean`).toBeLessThan(0.01);
			expect(Math.abs(actual.std - reference.std), `${name} std`).toBeLessThan(0.01);
		}
		// Peak deviation is checked on blue alone. Affinity's grain is only
		// *mostly* monochrome (the channels correlate at 0.95, not 1.0), so
		// green carries a few outliers past the shared envelope that an
		// extreme-value assertion would chase forever.
		const blue = statsOf(channels[2].actual);
		const blueReference = statsOf(channels[2].expected);
		expect(Math.abs(blue.min - blueReference.min), 'blue min').toBeLessThan(0.005);
		expect(Math.abs(blue.max - blueReference.max), 'blue max').toBeLessThan(0.005);
	});
});
