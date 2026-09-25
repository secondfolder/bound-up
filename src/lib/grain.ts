import { clamp01, formatGlslFloat, fract } from './shader-math';

/**
 * The grain: a monochrome, triangular deviation per pixel, matching the Noise
 * control of Affinity's filters. It is its own effect (`GrainEffect` in
 * `$lib/effects`) and runs after whatever comes before it in the chain — on
 * the landing page, after the halftone screen. See docs/page-effects.md.
 *
 * Alias-free, like `$lib/halftone`, so the reference tests run in plain node.
 */

/**
 * Peak deviation of the grain at strength 1, in 0..1 units.
 *
 * Measured from `testing/halftone-fixtures/noise`: at strength 0.5 the
 * per-channel delta spans exactly ±20/255 with a standard deviation of
 * 8.12/255. A triangular distribution over ±20/255 has sd 20/255/sqrt(6) =
 * 8.16/255, which is why the grain is two hashes summed rather than one.
 */
export const GRAIN_AMPLITUDE = 40 / 255;

/**
 * A uniform 0..1 value per pixel.
 *
 * Not the usual `fract(sin(dot(p, k)) * 43758.5453)`: that one is fine in
 * float64 but degrades on the GPU, where `sin` of a ~150000 radian argument
 * loses most of its mantissa. Measured in Chromium against the real WebGL
 * context, it produced grain with a standard deviation of 44/255 instead of
 * 52/255 and visible vertical streaking. This mixes by multiplication only —
 * every intermediate stays under 100, so float32 keeps the field white — and
 * measures 52.15/255 with autocorrelation under 0.006 at every lag, on both
 * paths. White, not identical: the two paths agree at about 0.8 correlation,
 * as rounding early on is amplified by the mixing (see docs/page-effects.md).
 */
export function grainHash(x: number, y: number): number {
	let qx = fract(x * 0.1031);
	let qy = fract(y * 0.103);
	let mixed = qx * (qy + 33.33) + qy * (qx + 33.33);
	qx = fract(qx + mixed);
	qy = fract(qy + mixed);
	mixed = qx * (qy + 19.19) + qy * (qx + 19.19);
	qx = fract(qx + mixed);
	qy = fract(qy + mixed);
	return fract(qx * qy * 97);
}

/**
 * Where the grain is measured from: the middle of the image, rounded down to a
 * whole pixel.
 *
 * The middle, because the landing page is laid out from its centre line: a
 * grain anchored to a corner stays put under that corner while a resize moves
 * everything else, so the content visibly slides over it. Measured from the
 * centre, widening the window adds grain at both edges and what lies under
 * the centred content stays where it is.
 *
 * Whole pixels, because a hash of a coordinate shifted by half a pixel is an
 * entirely different field — rounding exactly would reshuffle all of the grain
 * every time the width changed between odd and even.
 */
export function grainOrigin(width: number, height: number): { x: number; y: number } {
	return { x: Math.floor(width / 2), y: Math.floor(height / 2) };
}

/** Offsets for the second tap; arbitrary, chosen to decorrelate the pair. */
const GRAIN_SECOND_TAP_OFFSET = { x: 137.17, y: 91.31 };

export function grainDelta(x: number, y: number, strength: number): number {
	const first = grainHash(x, y);
	const second = grainHash(x + GRAIN_SECOND_TAP_OFFSET.x, y + GRAIN_SECOND_TAP_OFFSET.y);
	return (first + second - 1) * GRAIN_AMPLITUDE * strength;
}

export function applyGrain(value: number, x: number, y: number, strength: number): number {
	return clamp01(value + grainDelta(x, y, strength));
}

/** The grain is monochrome: one delta added to all three channels. */
export function applyMonochromeGrainRgb(
	red: number,
	green: number,
	blue: number,
	x: number,
	y: number,
	strength: number
): [number, number, number] {
	const delta = grainDelta(x, y, strength);
	return [clamp01(red + delta), clamp01(green + delta), clamp01(blue + delta)];
}

/**
 * The GPU half of the same model, as a VFX-JS effect pass (GLSL 300 es, the
 * default vertex shader's `uvContent` / `uvSrc` varyings). Keep it in step
 * with the functions above — `grain.test.ts` covers the CPU path, and
 * `GrainEffect.svelte.test.ts` compares the two.
 *
 * `elementPixel` is the element's size in buffer pixels. Positions are taken
 * from `uvContent` rather than `gl_FragCoord`, because the final stage draws
 * into a viewport offset somewhere inside VFX's shared canvas, and snapped to
 * pixel centres, because the hash is sensitive to the interpolation error a
 * raw `uvContent * size` carries.
 */
export function buildGrainFragmentShader(): string {
	return `#version 300 es
precision highp float;
in vec2 uvContent;
in vec2 uvSrc;
out vec4 outColor;
uniform sampler2D src;
uniform vec2 elementPixel;
uniform float strength;

float grainHash(vec2 p) {
	vec2 q = fract(p * vec2(0.1031, 0.1030));
	q += dot(q, q.yx + 33.33);
	q = fract(q);
	q += dot(q, q.yx + 19.19);
	q = fract(q);
	return fract(q.x * q.y * 97.0);
}

void main() {
	vec4 color = texture(src, uvSrc);
	// Measured from the element's centre, rounded down — see grainOrigin().
	// Measured bottom-up, where the CPU path runs top-down, which only
	// mirrors the field.
	vec2 pixel = floor(uvContent * elementPixel) + 0.5;
	vec2 grainCoord = pixel - floor(elementPixel / 2.0);
	vec2 grain = vec2(
		grainHash(grainCoord),
		grainHash(grainCoord + vec2(${formatGlslFloat(GRAIN_SECOND_TAP_OFFSET.x)}, ${formatGlslFloat(GRAIN_SECOND_TAP_OFFSET.y)}))
	);
	float delta = (grain.x + grain.y - 1.0) * ${formatGlslFloat(GRAIN_AMPLITUDE)} * strength;
	// VFX composites premultiplied, so the delta scales with alpha; on the
	// opaque screen it feeds on the landing page that is a plain add.
	outColor = vec4(clamp(color.rgb + delta * color.a, 0.0, color.a), color.a);
}`;
}
