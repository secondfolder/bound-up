import type { Effect, EffectContext } from '@vfx-js/core';
import { buildHalftoneLinesFragmentShader, type HalftonePattern } from '../halftone';
import type { EffectDims, Reactive } from './types';

export type HalftoneLinesParams = {
	/** Which motif to draw: parallel lines, or concentric rings. */
	pattern: HalftonePattern;
	/** Line pattern only: the angle of the lines, in degrees from horizontal. */
	angle: number;
	/** 0..1, Affinity's 0..100 contrast slider over 100. 0 is a plain
	 * grayscale pass; 1 is a hard black-and-white threshold. */
	contrast: number;
	/** Size of one cell, in CSS px: the distance between adjacent line (or
	 * ring) peaks. */
	cellSize: number;
	/** Pattern drift, in CSS px per second. 0 (the default) keeps the screen
	 * still, which is what lets the page stop drawing. */
	speed: number;
};

/**
 * How far, in CSS px, the screen is drawn past the element on every side.
 * It is only ever seen while the window grows faster than recaptures land:
 * the edges then show more screen instead of the bare page. Past the capture
 * there is nothing to screen, so the shader stretches the element's edge
 * pixels outwards — right for the landing page, whose edges are its
 * background.
 */
const BLEED = 240;

const FRAGMENT_SHADER = buildHalftoneLinesFragmentShader();

/**
 * Halftone Lines: a grayscale line (or ring) screen calibrated against
 * Affinity's Halftone filter — the model is `$lib/halftone`, and
 * docs/page-effects.md explains it. Named apart from `@vfx-js/effects`'
 * `HalftoneEffect`, which is a different thing: RGB/CMYK dots.
 *
 * The output is an opaque grayscale screen, meant to be soft-light blended
 * over the page it was captured from (see `VfxProvider`'s `blend`).
 *
 * Parameters are `$state`: assign one and the page redraws once.
 */
export class HalftoneLinesEffect implements Effect, Reactive {
	pattern: HalftonePattern = $state('line');
	angle = $state(0);
	contrast = $state(0.5);
	cellSize = $state(10);
	speed = $state(0);
	/** The bleed, in CSS px; see BLEED. */
	readonly bleed = BLEED;

	constructor(initial: Partial<HalftoneLinesParams> = {}) {
		this.pattern = initial.pattern ?? this.pattern;
		this.angle = initial.angle ?? this.angle;
		this.contrast = initial.contrast ?? this.contrast;
		this.cellSize = initial.cellSize ?? this.cellSize;
		this.speed = initial.speed ?? this.speed;
	}

	get animating(): boolean {
		return this.speed !== 0;
	}

	track(): void {
		void [this.pattern, this.angle, this.contrast, this.cellSize, this.speed];
	}

	outputRect(dims: EffectDims) {
		const bleed = this.bleed * dims.pixelRatio;
		const [width, height] = dims.elementPixel;
		return [-bleed, -bleed, width + 2 * bleed, height + 2 * bleed] as const;
	}

	render(ctx: EffectContext): void {
		ctx.draw({
			frag: FRAGMENT_SHADER,
			uniforms: {
				src: ctx.src,
				elementPixel: [ctx.dims.elementPixel[0], ctx.dims.elementPixel[1]],
				pattern: this.pattern === 'line' ? 1 : 0,
				angle: (this.angle * Math.PI) / 180,
				contrast: this.contrast,
				cellSize: this.cellSize * ctx.pixelRatio,
				drift: ctx.time * this.speed * ctx.pixelRatio
			},
			target: ctx.target
		});
	}
}
