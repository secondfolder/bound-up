/**
 * Scalar helpers shared by the CPU reference renderers (`$lib/halftone`,
 * `$lib/grain`) and the GLSL they generate. They mirror the GLSL built-ins of
 * the same names, so a CPU function and its shader line up line for line.
 */

const TRAILING_ZEROES = /\.0+$|(?<=\..*?)0+$/g;
const TRAILING_POINT = /\.$/;
const HAS_POINT_OR_EXPONENT = /[.eE]/;

export function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export function fract(value: number): number {
	return value - Math.floor(value);
}

/**
 * A number as a GLSL float literal. GLSL ES rejects `2` where a float is
 * expected, so a whole number keeps a trailing `.0`.
 */
export function formatGlslFloat(value: number): string {
	const fixed = value.toFixed(7);
	const trimmed = fixed.replace(TRAILING_ZEROES, '').replace(TRAILING_POINT, '');
	return HAS_POINT_OR_EXPONENT.test(trimmed) ? trimmed : `${trimmed}.0`;
}
