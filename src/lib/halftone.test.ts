import { describe, expect, it } from 'vitest';
import { applyGrain, grainOrigin } from './grain';
import {
	type HalftoneRenderOptions,
	halftoneContrastSlope,
	halftoneScreenValue,
	type NormalizedRgbaImage,
	renderHalftoneGrayscaleImage,
	renderSoftLightHalftoneImage,
	rgbToLuma
} from './halftone';
import { halftoneFixturePath as fixturePath } from './testing/fixture-stats';
import { decodePngToNormalizedImage } from './testing/png';

/**
 * Regressions against the Affinity reference exports.
 *
 * `testing/halftone-fixtures/README.md` records the filter settings each PNG
 * was produced with. Two things about how they are compared here:
 *
 * - Errors are in 0-255 units, because that is what the references are
 *   quantised to and the only unit where a tolerance means something
 *   ("within a couple of levels").
 * - Comparisons exclude a border margin. Affinity's screen picks up a linear
 *   offset near the canvas edge — measurably a shift of the *screen*, since
 *   solving for it gives the same number at every contrast level, where
 *   solving for a tone change does not — and that is an artefact of a filter
 *   running on a bounded canvas. The overlay covers a whole viewport, so
 *   reproducing it would be wrong.
 */
function grayscaleFromImage(image: NormalizedRgbaImage): Float32Array {
	const out = new Float32Array(image.width * image.height);
	for (let index = 0; index < out.length; index += 1) {
		const rgbaIndex = index * 4;
		out[index] = rgbToLuma(
			image.rgba[rgbaIndex],
			image.rgba[rgbaIndex + 1],
			image.rgba[rgbaIndex + 2]
		);
	}
	return out;
}

/** Root mean squared error in 0-255 levels, ignoring `margin` px of border. */
function rmse255(
	actual: ArrayLike<number>,
	expected: ArrayLike<number>,
	width: number,
	height: number,
	margin = 0,
	channels = 1
): number {
	let error = 0;
	let count = 0;
	for (let y = margin; y < height - margin; y += 1) {
		for (let x = margin; x < width - margin; x += 1) {
			for (let channel = 0; channel < channels; channel += 1) {
				const index = (y * width + x) * channels + channel;
				const delta = actual[index] - expected[index];
				error += delta * delta;
				count += 1;
			}
		}
	}
	return Math.sqrt(error / count) * 255;
}

function lineOptions(overrides: Partial<HalftoneRenderOptions> = {}): HalftoneRenderOptions {
	return {
		pattern: 'line',
		angleRadians: 0,
		contrast: 0.75,
		cellSize: 33.6,
		grainStrength: 0,
		drift: 0,
		...overrides
	};
}

describe('the halftone screen model', () => {
	it('is a triangle with its trough on the cell centre', () => {
		expect(halftoneScreenValue(0, 80)).toBeCloseTo(0, 6);
		expect(halftoneScreenValue(20, 80)).toBeCloseTo(0.5, 6);
		expect(halftoneScreenValue(40, 80)).toBeCloseTo(1, 6);
		expect(halftoneScreenValue(60, 80)).toBeCloseTo(0.5, 6);
		expect(halftoneScreenValue(80, 80)).toBeCloseTo(0, 6);
		// Even, which is what lets the shader mirror the y axis for free.
		expect(halftoneScreenValue(-13, 80)).toBeCloseTo(halftoneScreenValue(13, 80), 6);
	});

	it('maps contrast onto the tangent slope law', () => {
		expect(halftoneContrastSlope(0)).toBeCloseTo(0, 6);
		expect(halftoneContrastSlope(0.25)).toBeCloseTo(Math.SQRT2 - 1, 6);
		expect(halftoneContrastSlope(0.5)).toBeCloseTo(1, 6);
		expect(halftoneContrastSlope(0.75)).toBeCloseTo(Math.SQRT2 + 1, 6);
		expect(halftoneContrastSlope(1)).toBe(1e6);
	});

	it('leaves the image untouched at contrast 0', () => {
		const source = decodePngToNormalizedImage(fixturePath('contrast', 'no-filter.png'));
		const actual = renderHalftoneGrayscaleImage(source, lineOptions({ contrast: 0, cellSize: 80 }));
		expect(rmse255(actual, grayscaleFromImage(source), source.width, source.height)).toBeLessThan(
			0.01
		);
	});

	it('is the screen, then the grain', () => {
		// The page runs these as two effects, `[HalftoneLinesEffect,
		// GrainEffect]`; the combined reference is the same two steps.
		const source = decodePngToNormalizedImage(fixturePath('contrast', 'no-filter.png'));
		const options = lineOptions({ contrast: 0.4, cellSize: 20, grainStrength: 1.3 });
		const combined = renderHalftoneGrayscaleImage(source, options);
		const screenOnly = renderHalftoneGrayscaleImage(source, { ...options, grainStrength: 0 });
		const origin = grainOrigin(source.width, source.height);
		for (let y = 0; y < source.height; y += 1) {
			for (let x = 0; x < source.width; x += 1) {
				const index = y * source.width + x;
				expect(combined[index]).toBeCloseTo(
					applyGrain(screenOnly[index], x + 0.5 - origin.x, y + 0.5 - origin.y, 1.3),
					6
				);
			}
		}
	});
});

describe('halftone reference regressions', () => {
	it('reproduces the Affinity contrast sweep at cell 80', () => {
		const source = decodePngToNormalizedImage(fixturePath('contrast', 'no-filter.png'));
		// The strip is 10 px wide, so the border margin has to be taken in y
		// only: the edge artefact runs in from the top and bottom.
		const margin = 95;
		const rows = source.height - margin * 2;
		const crop = (values: ArrayLike<number>) =>
			Array.from(
				{ length: rows * source.width },
				(_, index) => values[index + margin * source.width]
			);
		for (const [fileName, contrast, tolerance] of [
			['filter-0-contrast.png', 0, 0.5],
			['filter-25-contrast.png', 0.25, 3],
			['filter-50-contrast.png', 0.5, 3],
			['filter-75-contrast.png', 0.75, 3.5],
			// A hard threshold disagrees by a full 255 wherever the crossing row
			// is ambiguous, which one row per cell inevitably is.
			['filter-100-contrast.png', 1, 30]
		] as const) {
			const expected = grayscaleFromImage(
				decodePngToNormalizedImage(fixturePath('contrast', fileName))
			);
			const actual = renderHalftoneGrayscaleImage(source, lineOptions({ contrast, cellSize: 80 }));
			expect(rmse255(crop(actual), crop(expected), source.width, rows), fileName).toBeLessThan(
				tolerance
			);
		}
	});

	it('reproduces the 33.6 px contrast-75 references at 0, 15 and 45 degrees', () => {
		const source = decodePngToNormalizedImage(
			fixturePath('shape-2', 'without-halftone-filter.png')
		);
		for (const [fileName, angleRadians, tolerance] of [
			['with-halftone-filter-0-deg.png', 0, 2.5],
			['with-halftone-filter-15-deg.png', Math.PI / 12, 9],
			['with-halftone-filter-45-deg.png', Math.PI / 4, 5]
		] as const) {
			const expected = grayscaleFromImage(
				decodePngToNormalizedImage(fixturePath('shape-2', fileName))
			);
			const actual = renderHalftoneGrayscaleImage(source, lineOptions({ angleRadians }));
			expect(rmse255(actual, expected, source.width, source.height, 20), fileName).toBeLessThan(
				tolerance
			);
		}
	});

	it('keeps the ink coverage of a fully thresholded screen equal to 1 - tone', () => {
		// The property that makes a triangle the right screen: at contrast 1 the
		// black fraction of a cell equals the ink fraction of the tone, so the
		// filter reproduces tone linearly instead of crushing it.
		const width = 16;
		const height = 800;
		const image: NormalizedRgbaImage = {
			width,
			height,
			rgba: new Float32Array(width * height * 4)
		};
		for (let index = 0; index < width * height; index += 1) {
			image.rgba.set([0.4, 0.4, 0.4, 1], index * 4);
		}
		const rendered = renderHalftoneGrayscaleImage(
			image,
			lineOptions({ contrast: 1, cellSize: 80 })
		);
		let ink = 0;
		for (const value of rendered) {
			if (value < 0.5) {
				ink += 1;
			}
		}
		expect(ink / rendered.length).toBeCloseTo(0.6, 2);
	});

	it('matches the soft-light reference', () => {
		// The `shape` / `soft-light` pair does not reproduce at its recorded
		// settings: fitting the model to it lands on cell 52.2 / contrast 43.5
		// rather than 50 / 50, and its whole 100 px frame sits inside the edge
		// artefact. It is kept as a blend check and rendered with the fitted
		// screen, so the assertion is about soft-light and not the cell size.
		const source = decodePngToNormalizedImage(
			fixturePath('soft-light', 'without-halftone-filter.png')
		);
		const expected = decodePngToNormalizedImage(
			fixturePath('soft-light', 'with-halftone-filter-and-soft-light.png')
		);
		const actual = renderSoftLightHalftoneImage(
			source,
			lineOptions({ contrast: 0.435, cellSize: 52.15 })
		);
		expect(rmse255(actual, expected.rgba, source.width, source.height, 20, 4)).toBeLessThan(14);
	});
});
