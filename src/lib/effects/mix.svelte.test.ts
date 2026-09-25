import { BloomEffect, HalftoneEffect } from '@vfx-js/effects';
import { afterEach, describe, expect, it } from 'vitest';
import { GRAIN_AMPLITUDE } from '$lib/grain';
import { type EffectsRun, type Pixels, runEffects, sourceCanvas } from '$lib/testing/vfx';
import { GrainEffect } from './grain-effect.svelte';
import { HalftoneLinesEffect } from './halftone-lines-effect.svelte';
import { mix, SOFT_LIGHT_NEUTRAL } from './mix.svelte';
import { flattenEffects } from './types';

let run: EffectsRun | undefined;
afterEach(() => {
	run?.dispose();
	run = undefined;
});

const WIDTH = 120;
const HEIGHT = 100;

function gradient() {
	return sourceCanvas(WIDTH, HEIGHT, (context) => {
		const across = context.createLinearGradient(0, 0, WIDTH, 0);
		across.addColorStop(0, '#943700');
		across.addColorStop(1, '#ffc621');
		context.fillStyle = across;
		context.fillRect(0, 0, WIDTH, HEIGHT);
	});
}

function screen() {
	return new HalftoneLinesEffect({ angle: 15, contrast: 0.4, cellSize: 8 });
}

async function render(effect: Parameters<typeof flattenEffects>[0]): Promise<Pixels> {
	run?.dispose();
	run = await runEffects(gradient(), flattenEffects(effect));
	return run.read();
}

function maxDifference(a: Pixels, b: Pixels): number {
	let max = 0;
	for (let index = 0; index < a.data.length; index += 1) {
		max = Math.max(max, Math.abs((a.data[index] ?? 0) - (b.data[index] ?? 0)));
	}
	return max;
}

function row(pixels: Pixels, y: number): number[] {
	return Array.from(pixels.data.slice(y * WIDTH * 4, (y + 1) * WIDTH * 4));
}

describe('mix()', () => {
	it('at opacity 1 is the effect it wraps', async () => {
		const plain = await render(screen());
		const mixed = await render(mix(screen()));
		expect(maxDifference(plain, mixed)).toBeLessThanOrEqual(1);
	});

	it('at opacity 0 is its input, or its `toward` colour', async () => {
		const input = await render([]);
		const none = await render(mix(screen(), { opacity: 0 }));
		expect(maxDifference(input, none)).toBeLessThanOrEqual(1);

		const grey = await render(mix(screen(), { opacity: 0, toward: SOFT_LIGHT_NEUTRAL }));
		expect(new Set(grey.data)).toEqual(new Set([128, 255]));
	});

	it('fades out down the element, between `from` and `to`', async () => {
		const full = await render(screen());
		const faded = await render(
			mix(screen(), { toward: SOFT_LIGHT_NEUTRAL, fade: { from: 30, to: 70 } })
		);
		// Above the fade: the screen as it was.
		for (let y = 0; y < 29; y += 1) {
			expect(row(faded, y)).toEqual(row(full, y));
		}
		// Below it: grey.
		for (let y = 71; y < HEIGHT; y += 1) {
			expect(new Set(row(faded, y))).toEqual(new Set([128, 255]));
		}
		// Between: each row's distance from grey only shrinks.
		const spread = (y: number) =>
			row(faded, y)
				.filter((_, index) => index % 4 === 0)
				.reduce((sum, value) => sum + Math.abs(value - 128), 0);
		const spreadOfFull = (y: number) =>
			row(full, y)
				.filter((_, index) => index % 4 === 0)
				.reduce((sum, value) => sum + Math.abs(value - 128), 0);
		let previous = Number.POSITIVE_INFINITY;
		for (let y = 30; y <= 70; y += 1) {
			const ratio = spread(y) / (spreadOfFull(y) || 1);
			expect(ratio, `row ${y}`).toBeLessThanOrEqual(previous + 0.02);
			previous = ratio;
		}
	});

	it('redraws with a new opacity', async () => {
		const mixed = mix(screen(), { toward: SOFT_LIGHT_NEUTRAL, opacity: 1 });
		run = await runEffects(gradient(), mixed.effects);
		const before = run.read();
		mixed.opacity = 0;
		const after = run.read();
		expect(maxDifference(before, after)).toBeGreaterThan(50);
		expect(new Set(after.data)).toEqual(new Set([128, 255]));
	});

	// A library effect runs as an ordinary stage between mix's own two, so
	// wrapping it changes nothing at opacity 1.
	for (const [name, make] of [
		['HalftoneEffect', () => new HalftoneEffect({ gridSize: 8 })],
		['BloomEffect', () => new BloomEffect({ threshold: 0.2, intensity: 2 })]
	] as const) {
		it(`wraps @vfx-js/effects' ${name} unchanged at opacity 1`, async () => {
			const plain = await render(make());
			const mixed = await render(mix(make()));
			expect(maxDifference(plain, mixed)).toBeLessThanOrEqual(1);
		});
	}

	it('fades the halftone to grey under the grain', async () => {
		const pixels = await render([
			mix(screen(), { toward: SOFT_LIGHT_NEUTRAL, opacity: 0 }),
			new GrainEffect({ strength: 1.3 })
		]);
		const values = Array.from(pixels.data.filter((_, index) => index % 4 === 0));
		const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
		expect(Math.abs(mean - 128)).toBeLessThan(2);
		expect(Math.max(...values.map((value) => Math.abs(value - 128)))).toBeLessThanOrEqual(
			GRAIN_AMPLITUDE * 1.3 * 255 + 1
		);
		expect(Math.min(...values)).toBeLessThan(128 - 20);
	});
});
