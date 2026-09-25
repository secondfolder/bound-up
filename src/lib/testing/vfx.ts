import { type Effect, VFX } from '@vfx-js/core';
import type { NormalizedRgbaImage } from '../halftone';

/**
 * Renders effects through a real VFX-JS instance in the component-test
 * browser, for comparing the GPU half of an effect against its CPU reference.
 * Browser project only.
 */

export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

/**
 * A canvas painted by `paint`, pinned to the frame's top-left corner: VFX draws
 * an element over its box, so its output then sits at the same pixels of VFX's
 * own canvas, which (with `scrollPadding: false`) is fixed over the viewport.
 */
export function sourceCanvas(
	width: number,
	height: number,
	paint: (context: CanvasRenderingContext2D) => void
): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	Object.assign(canvas.style, {
		position: 'fixed',
		left: '0',
		top: '0',
		width: `${width}px`,
		height: `${height}px`
	});
	const context = canvas.getContext('2d');
	if (!context) {
		throw new Error('no 2D context to paint the source with');
	}
	paint(context);
	document.body.append(canvas);
	return canvas;
}

/** A canvas's pixels as the CPU reference renderers take them. */
export function normalizedImage(canvas: HTMLCanvasElement): NormalizedRgbaImage {
	const context = canvas.getContext('2d');
	if (!context) {
		throw new Error('no 2D context to read the source with');
	}
	const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
	return {
		width: canvas.width,
		height: canvas.height,
		rgba: Float32Array.from(data, (v) => v / 255)
	};
}

export type EffectsRun = {
	vfx: VFX;
	/** Draws a frame and reads back `region` of it (default: the source's box). */
	read: (region?: { x: number; y: number; width: number; height: number }) => Pixels;
	dispose: () => void;
};

export async function runEffects(
	source: HTMLCanvasElement,
	effect: Effect | readonly Effect[]
): Promise<EffectsRun> {
	const vfx = new VFX({ autoplay: false, pixelRatio: 1, scrollPadding: false });
	const output = document.body.lastElementChild;
	if (!(output instanceof HTMLCanvasElement)) {
		throw new Error('VFX did not append its canvas to <body>');
	}
	await vfx.add(source, { effect });
	return {
		vfx,
		read(region = { x: 0, y: 0, width: source.width, height: source.height }) {
			// Read in the same task as the draw: the context has no
			// preserveDrawingBuffer, so the buffer is cleared once presented.
			vfx.render();
			const scratch = document.createElement('canvas');
			scratch.width = region.width;
			scratch.height = region.height;
			const context = scratch.getContext('2d');
			if (!context) {
				throw new Error('no 2D context to read the output with');
			}
			context.drawImage(
				output,
				region.x,
				region.y,
				region.width,
				region.height,
				0,
				0,
				region.width,
				region.height
			);
			return {
				width: region.width,
				height: region.height,
				data: context.getImageData(0, 0, region.width, region.height).data
			};
		},
		dispose() {
			vfx.destroy();
			source.remove();
		}
	};
}

/** Root mean squared error in 0-255 levels between one channel of `pixels`
 * and a 0..1 reference of the same size. */
export function rmse255(pixels: Pixels, expected: ArrayLike<number>, channel = 0): number {
	let error = 0;
	for (let index = 0; index < expected.length; index += 1) {
		const delta = (pixels.data[index * 4 + channel] ?? 0) / 255 - expected[index];
		error += delta * delta;
	}
	return Math.sqrt(error / expected.length) * 255;
}
