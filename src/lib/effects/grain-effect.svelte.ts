import type { Effect, EffectContext } from '@vfx-js/core';
import { buildGrainFragmentShader } from '../grain';
import type { Reactive } from './types';

export type GrainParams = {
	/** 0..1, Affinity's 0..100 noise slider over 100. Higher is allowed, but
	 * grain wide enough to clip only survives in the mid-tones, where it
	 * reads as the band pattern — see docs/page-effects.md. */
	strength: number;
};

const FRAGMENT_SHADER = buildGrainFragmentShader();

/**
 * Monochrome grain, calibrated against Affinity's Noise control — the model
 * is `$lib/grain`. A filter on whatever comes before it in the chain: after
 * `HalftoneLinesEffect` on the landing page, but it works as well after a
 * library effect or straight on a capture. It draws nothing of its own
 * outside its input's rect, so it inherits any bleed a stage before it adds.
 *
 * `@vfx-js/effects` has no grain or noise filter, which is why this exists.
 * `strength` is `$state`: assign it and the page redraws once.
 */
export class GrainEffect implements Effect, Reactive {
	strength = $state(0.5);

	constructor(initial: Partial<GrainParams> = {}) {
		this.strength = initial.strength ?? this.strength;
	}

	track(): void {
		void this.strength;
	}

	render(ctx: EffectContext): void {
		ctx.draw({
			frag: FRAGMENT_SHADER,
			uniforms: {
				src: ctx.src,
				elementPixel: [ctx.dims.elementPixel[0], ctx.dims.elementPixel[1]],
				strength: this.strength
			},
			target: ctx.target
		});
	}
}
