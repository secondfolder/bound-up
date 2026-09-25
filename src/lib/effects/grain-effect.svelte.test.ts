import { afterEach, describe, expect, it } from 'vitest';
import { GRAIN_AMPLITUDE, grainDelta, grainOrigin } from '$lib/grain';
import { renderHalftoneGrayscaleImage } from '$lib/halftone';
import { type EffectsRun, normalizedImage, runEffects, sourceCanvas } from '$lib/testing/vfx';
import { GrainEffect } from './grain-effect.svelte';
import { HalftoneLinesEffect } from './halftone-lines-effect.svelte';

/**
 * The GPU half of the grain against its CPU reference (`$lib/grain`). The
 * shader measures bottom-up where the reference measures top-down, which
 * mirrors the field in y, so the reference is sampled at the mirrored row.
 *
 * Compared by correlation and by distribution, not pixel for pixel: the hash
 * is white in float32 as well as float64 (see `grainHash`), but it is not the
 * *same* field in both — a rounding difference early on is amplified by the
 * mixing steps, and measured here about one pixel in five comes out
 * unrelated. The two agree at 0.8 correlation, where a mis-mapped field (the
 * wrong mirror, or an origin off by a pixel) is at 0.
 */

let run: EffectsRun | undefined;
afterEach(() => {
	run?.dispose();
	run = undefined;
});

const WIDTH = 96;
const HEIGHT = 64;

/** The CPU grain delta at the pixel the GPU draws at top-down row `y`. */
function gpuGrainDelta(x: number, y: number, strength: number): number {
	const origin = grainOrigin(WIDTH, HEIGHT);
	return grainDelta(x + 0.5 - origin.x, HEIGHT - 1 - y + 0.5 - origin.y, strength);
}

function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
	const n = a.length;
	let [sumA, sumB, sumAB, sumAA, sumBB] = [0, 0, 0, 0, 0];
	for (let index = 0; index < n; index += 1) {
		const [x, y] = [a[index] ?? 0, b[index] ?? 0];
		[sumA, sumB, sumAB, sumAA, sumBB] = [
			sumA + x,
			sumB + y,
			sumAB + x * y,
			sumAA + x * x,
			sumBB + y * y
		];
	}
	const covariance = sumAB / n - (sumA / n) * (sumB / n);
	return covariance / Math.sqrt((sumAA / n - (sumA / n) ** 2) * (sumBB / n - (sumB / n) ** 2));
}

function flatGrey() {
	return sourceCanvas(WIDTH, HEIGHT, (context) => {
		context.fillStyle = 'rgb(128 128 128)';
		context.fillRect(0, 0, WIDTH, HEIGHT);
	});
}

describe('GrainEffect', () => {
	it('adds the reference grain, monochrome, within its amplitude', async () => {
		run = await runEffects(flatGrey(), new GrainEffect({ strength: 1 }));
		const { data } = run.read();
		const actual = new Float32Array(WIDTH * HEIGHT);
		const expected = new Float32Array(WIDTH * HEIGHT);
		for (let y = 0; y < HEIGHT; y += 1) {
			for (let x = 0; x < WIDTH; x += 1) {
				const index = y * WIDTH + x;
				const value = data[index * 4] ?? 0;
				expect(data[index * 4 + 1]).toBe(value);
				expect(data[index * 4 + 2]).toBe(value);
				expect(Math.abs(value - 128)).toBeLessThanOrEqual(GRAIN_AMPLITUDE * 255 + 1);
				actual[index] = (value - 128) / 255;
				expected[index] = gpuGrainDelta(x, y, 1);
			}
		}
		expect(correlation(actual, expected)).toBeGreaterThan(0.7);
		// Triangular over ±40/255 has sd (40/255)/sqrt(6).
		const mean = actual.reduce((sum, value) => sum + value, 0) / actual.length;
		const sd = Math.sqrt(
			actual.reduce((sum, value) => sum + (value - mean) ** 2, 0) / actual.length
		);
		expect(Math.abs(mean)).toBeLessThan(0.005);
		expect(sd).toBeCloseTo(GRAIN_AMPLITUDE / Math.sqrt(6), 2);
	});

	it('scales with strength', async () => {
		run = await runEffects(flatGrey(), new GrainEffect({ strength: 0 }));
		const { data } = run.read();
		expect(new Set(data.filter((_, index) => index % 4 === 0))).toEqual(new Set([128]));
	});

	it('chains after the halftone as the combined reference does', async () => {
		const source = sourceCanvas(WIDTH, HEIGHT, (context) => {
			const across = context.createLinearGradient(0, 0, WIDTH, 0);
			across.addColorStop(0, '#943700');
			across.addColorStop(1, '#ffc621');
			context.fillStyle = across;
			context.fillRect(0, 0, WIDTH, HEIGHT);
		});
		run = await runEffects(source, [
			new HalftoneLinesEffect({ angle: 15, contrast: 0.4, cellSize: 6 }),
			new GrainEffect({ strength: 1.3 })
		]);
		const pixels = run.read();
		const screen = renderHalftoneGrayscaleImage(normalizedImage(source), {
			pattern: 'line',
			angleRadians: (15 * Math.PI) / 180,
			contrast: 0.4,
			cellSize: 6,
			grainStrength: 0
		});
		// Where the screen is clear of both ends, what the grain added is the
		// reference grain; everywhere, it is within the grain's amplitude.
		const added: number[] = [];
		const reference: number[] = [];
		for (const [index, value] of screen.entries()) {
			const delta = (pixels.data[index * 4] ?? 0) / 255 - value;
			expect(Math.abs(delta)).toBeLessThanOrEqual(GRAIN_AMPLITUDE * 1.3 + 1.5 / 255);
			if (value > 0.25 && value < 0.75) {
				added.push(delta);
				reference.push(gpuGrainDelta(index % WIDTH, Math.floor(index / WIDTH), 1.3));
			}
		}
		expect(added.length).toBeGreaterThan(500);
		expect(correlation(added, reference)).toBeGreaterThan(0.7);
	});
});
