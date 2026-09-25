import { afterEach, describe, expect, it } from 'vitest';
import { renderHalftoneGrayscaleImage } from '$lib/halftone';
import {
	type EffectsRun,
	normalizedImage,
	rmse255,
	runEffects,
	sourceCanvas
} from '$lib/testing/vfx';
import { HalftoneLinesEffect } from './halftone-lines-effect.svelte';

/**
 * The GPU half of the screen against its CPU reference (`$lib/halftone`,
 * which `halftone.test.ts` holds to the Affinity exports). The shader runs
 * bottom-up where the reference runs top-down; the screen is even about the
 * centre, so the two agree pixel for pixel.
 */

let run: EffectsRun | undefined;
afterEach(() => {
	run?.dispose();
	run = undefined;
});

/** A two-way gradient across the landing page's tones and brighter. */
function gradient(width: number, height: number) {
	return sourceCanvas(width, height, (context) => {
		const across = context.createLinearGradient(0, 0, width, 0);
		across.addColorStop(0, '#943700');
		across.addColorStop(1, '#ffc621');
		context.fillStyle = across;
		context.fillRect(0, 0, width, height);
		const down = context.createLinearGradient(0, 0, 0, height);
		down.addColorStop(0, 'rgb(0 0 0 / 0)');
		down.addColorStop(1, 'rgb(0 0 0 / 0.5)');
		context.fillStyle = down;
		context.fillRect(0, 0, width, height);
	});
}

describe('HalftoneLinesEffect', () => {
	it.each(['line', 'circle'] as const)('matches the CPU reference (%s)', async (pattern) => {
		const source = gradient(160, 120);
		const params = { pattern, angle: 15, contrast: 0.4, cellSize: 12 };
		run = await runEffects(source, new HalftoneLinesEffect(params));
		const pixels = run.read();

		const expected = renderHalftoneGrayscaleImage(normalizedImage(source), {
			pattern,
			angleRadians: (15 * Math.PI) / 180,
			contrast: 0.4,
			cellSize: 12,
			grainStrength: 0
		});
		expect(rmse255(pixels, expected)).toBeLessThan(1.5);
	});

	it('draws an opaque grayscale screen', async () => {
		run = await runEffects(gradient(160, 120), new HalftoneLinesEffect({ contrast: 0.4 }));
		const { data } = run.read();
		for (let index = 0; index < data.length; index += 4) {
			expect(data[index + 3]).toBe(255);
			expect(data[index]).toBe(data[index + 1]);
			expect(data[index + 1]).toBe(data[index + 2]);
		}
	});

	it('carries the screen on past the element, into its bleed', async () => {
		// Placed away from the corner so there is room around it to read.
		const source = gradient(120, 80);
		source.style.left = '300px';
		source.style.top = '300px';
		run = await runEffects(source, new HalftoneLinesEffect({ contrast: 0.4, cellSize: 12 }));
		const beside = run.read({ x: 300 + 120 + 20, y: 300, width: 40, height: 80 });
		const values = Array.from(beside.data.filter((_, index) => index % 4 === 0));
		// Painted, and still a screen: the edge colour stretched outwards,
		// screened into bands, not a flat fill.
		expect(Math.min(...values)).toBeLessThan(40);
		expect(Math.max(...values)).toBeGreaterThan(120);
	});

	it('reports animating only while it drifts', () => {
		const effect = new HalftoneLinesEffect();
		expect(effect.animating).toBe(false);
		effect.speed = 10;
		expect(effect.animating).toBe(true);
	});
});
