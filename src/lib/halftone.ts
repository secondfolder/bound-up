import { applyGrain, grainOrigin } from './grain';
import { clamp01, formatGlslFloat, fract } from './shader-math';

/**
 * The halftone screen, calibrated against Affinity's Halftone filter: Rec.601
 * luma, a triangle screen and a tangent contrast slope. On the page it runs as
 * `HalftoneLinesEffect` (`$lib/effects`), the GPU half generated below; the
 * CPU functions are the reference it is tested against. The grain is its own
 * model, in `$lib/grain`. See docs/page-effects.md.
 *
 * Alias-free, so the reference tests run in plain node.
 */
export type HalftonePattern = 'circle' | 'line';

export type NormalizedRgbaImage = {
	width: number;
	height: number;
	rgba: Float32Array;
};

export type HalftoneRenderOptions = {
	pattern?: HalftonePattern;
	angleRadians?: number;
	/** 0..1, matching Affinity's 0..100 contrast slider divided by 100. */
	contrast: number;
	/** Distance between adjacent line centres (or rings), in pixels. */
	cellSize: number;
	/** 0..1, matching Affinity's 0..100 noise slider divided by 100. Applied
	 * after the screen, as `[HalftoneLinesEffect, GrainEffect]` does. */
	grainStrength: number;
	/** Pattern offset along the screen axis, in pixels. */
	drift?: number;
	centerX?: number;
	centerY?: number;
};

/**
 * Rec.601 luma on the sRGB values directly, with no linearisation.
 *
 * Confirmed exactly by the contrast-0 reference, which is the filter's
 * grayscale pass with the screen switched off: solid #FFC621 comes back as
 * 196/255, which is Rec.601 (196.2) and not Rec.709 (198.2) or the channel
 * mean (162).
 */
export function rgbToLuma(red: number, green: number, blue: number): number {
	return red * 0.299 + green * 0.587 + blue * 0.114;
}

/**
 * The screen: a symmetric triangle wave over one cell, 0 at the cell centre
 * rising to 1 at the cell edge.
 *
 * A triangle is uniformly distributed, so thresholding it at `1 - tone` covers
 * exactly `1 - tone` of the area — the screen reproduces tone linearly, which
 * is what the contrast-100 reference does (a 0.7695 tone leaves an 18 px black
 * band per 80 px cell).
 */
export function halftoneScreenValue(coordAlong: number, cellSize: number): number {
	const phase = fract(coordAlong / cellSize);
	return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

/**
 * Affinity's contrast slider is the classic tangent slope law.
 *
 * Fitted against the cell-80 sweep, where the measured screen slope per pixel
 * gives 0.4165 / 0.9945 / 2.431 at contrast 25 / 50 / 75 — that is tan(22.5°),
 * tan(45°) and tan(67.5°) to within a quantisation step. Contrast 0 is a flat
 * grayscale pass and contrast 100 is a hard threshold, and both fall out of
 * the same formula.
 */
export function halftoneContrastSlope(contrast: number): number {
	// tan() reaches ~1.6e16 at exactly 1; cap it so the shader's highp float
	// cannot produce an Inf/NaN while still acting as a hard threshold.
	return Math.min(Math.tan((Math.PI / 2) * clamp01(contrast)), 1e6);
}

/**
 * The whole filter, per pixel.
 *
 * `tone + slope * (screen - (1 - tone))` pivots on the point where the screen
 * crosses the ink threshold: there the output is the tone itself whatever the
 * contrast, which is why every curve in the reference sweep passes through the
 * same two rows per cell.
 */
export function renderHalftoneScreenValue(
	gray: number,
	coordAlong: number,
	cellSize: number,
	contrast: number
): number {
	const screen = halftoneScreenValue(coordAlong, cellSize);
	return clamp01(gray + halftoneContrastSlope(contrast) * (screen - (1 - gray)));
}

export function softLightChannel(base: number, blend: number): number {
	if (blend <= 0.5) {
		return base - (1 - 2 * blend) * base * (1 - base);
	}
	const transformed = base <= 0.25 ? ((16 * base - 12) * base + 4) * base : Math.sqrt(base);
	return base + (2 * blend - 1) * (transformed - base);
}

export function softLightGrayOnRgb(
	red: number,
	green: number,
	blue: number,
	blendGray: number
): [number, number, number] {
	return [
		clamp01(softLightChannel(red, blendGray)),
		clamp01(softLightChannel(green, blendGray)),
		clamp01(softLightChannel(blue, blendGray))
	];
}

/**
 * Distance along the screen axis, measured from the image centre.
 *
 * The centre is where the screen's phase is zero: in the cell-80 reference the
 * minima land on rows 9.5 + 80k of a 500 px image, and 249.5 is one of them.
 * Angle is measured from horizontal with y running down the image, matching
 * the 15 and 45 degree references.
 */
export function halftoneCoordAlong(
	pattern: HalftonePattern,
	x: number,
	y: number,
	angleRadians: number,
	centerX: number,
	centerY: number
): number {
	const deltaX = x - centerX;
	const deltaY = y - centerY;
	if (pattern === 'circle') {
		return Math.hypot(deltaX, deltaY);
	}
	return deltaX * Math.sin(angleRadians) + deltaY * Math.cos(angleRadians);
}

/**
 * Tone is read straight from the pixel — the filter does not pre-blur.
 *
 * Worth stating because it is the obvious thing to assume: an earlier version
 * averaged the source along the screen axis, and dropping that is most of what
 * took the 33.6 px / contrast-75 references from visibly wrong to 1.6/255 RMSE.
 *
 * The screen, then the grain: the same two steps, in the same order, as the
 * `[HalftoneLinesEffect, GrainEffect]` chain on the page. The screen's value
 * is clamped before the grain is added, so running them as two passes is the
 * same arithmetic as the single shader this used to be.
 */
export function renderHalftoneGrayscalePixel(
	image: NormalizedRgbaImage,
	x: number,
	y: number,
	options: HalftoneRenderOptions
): number {
	const index = (y * image.width + x) * 4;
	const gray = rgbToLuma(image.rgba[index], image.rgba[index + 1], image.rgba[index + 2]);
	const coordAlong =
		halftoneCoordAlong(
			options.pattern ?? 'line',
			x + 0.5,
			y + 0.5,
			options.angleRadians ?? 0,
			options.centerX ?? image.width / 2,
			options.centerY ?? image.height / 2
		) - (options.drift ?? 0);
	const value = renderHalftoneScreenValue(gray, coordAlong, options.cellSize, options.contrast);
	const origin = grainOrigin(image.width, image.height);
	return applyGrain(value, x + 0.5 - origin.x, y + 0.5 - origin.y, options.grainStrength);
}

export function renderHalftoneGrayscaleImage(
	image: NormalizedRgbaImage,
	options: HalftoneRenderOptions
): Float32Array {
	const out = new Float32Array(image.width * image.height);
	for (let y = 0; y < image.height; y += 1) {
		for (let x = 0; x < image.width; x += 1) {
			out[y * image.width + x] = renderHalftoneGrayscalePixel(image, x, y, options);
		}
	}
	return out;
}

export function renderSoftLightHalftoneImage(
	image: NormalizedRgbaImage,
	options: HalftoneRenderOptions
): Float32Array {
	const halftone = renderHalftoneGrayscaleImage(image, options);
	const out = new Float32Array(image.width * image.height * 4);
	for (let index = 0; index < image.width * image.height; index += 1) {
		const rgbaIndex = index * 4;
		const [red, green, blue] = softLightGrayOnRgb(
			image.rgba[rgbaIndex],
			image.rgba[rgbaIndex + 1],
			image.rgba[rgbaIndex + 2],
			halftone[index]
		);
		out[rgbaIndex] = red;
		out[rgbaIndex + 1] = green;
		out[rgbaIndex + 2] = blue;
		out[rgbaIndex + 3] = 1;
	}
	return out;
}

/**
 * The GPU half of the screen, as a VFX-JS effect pass (GLSL 300 es, the
 * default vertex shader's `uvContent` varying). Keep it in step with the
 * functions above — `halftone.test.ts` covers the CPU path, and
 * `HalftoneLinesEffect.svelte.test.ts` compares the two.
 *
 * Positions are element-local buffer pixels, snapped to pixel centres, taken
 * from `uvContent` rather than `gl_FragCoord`: the final stage draws into a
 * viewport offset somewhere inside VFX's shared canvas. `uvContent` runs past
 * 0..1 in the bleed the effect draws around the element; the screen is a
 * function of position alone and carries on there, and the texture read is
 * clamped, which stretches the element's edge pixels outwards.
 */
export function buildHalftoneLinesFragmentShader(): string {
	return `#version 300 es
precision highp float;
in vec2 uvContent;
out vec4 outColor;
uniform sampler2D src;
uniform vec4 srcRectUv;
uniform vec2 elementPixel;
uniform int pattern;
uniform float angle;
uniform float contrast;
uniform float cellSize;
uniform float drift;

void main() {
	vec2 pixel = floor(uvContent * elementPixel) + 0.5;
	// y runs up here while the reference renders run down, so the screen
	// axis is mirrored in y. The triangle is an even function, so mirroring
	// the whole coordinate is free and only the sin term needs the sign flip.
	vec2 fromCentre = pixel - elementPixel / 2.0;
	float coordAlong;
	if (pattern == 0) {
		coordAlong = length(fromCentre);
	} else {
		coordAlong = dot(fromCentre, vec2(-sin(angle), cos(angle)));
	}
	coordAlong -= drift;

	vec2 uv = srcRectUv.xy + clamp(uvContent, 0.0, 1.0) * srcRectUv.zw;
	float gray = clamp(dot(texture(src, uv).rgb, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);

	float phase = fract(coordAlong / cellSize);
	float screen = phase < 0.5 ? phase * 2.0 : 2.0 - phase * 2.0;
	float slope = min(tan(${formatGlslFloat(Math.PI / 2)} * clamp(contrast, 0.0, 1.0)), 1000000.0);
	float value = clamp(gray + slope * (screen - (1.0 - gray)), 0.0, 1.0);
	outColor = vec4(vec3(value), 1.0);
}`;
}
