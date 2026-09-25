import type { Effect, EffectContext, EffectRenderTarget } from '@vfx-js/core';
import { type EffectGroup, type EffectInput, flattenEffects } from './types';

export type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

/** A vertical fade, in CSS px down from the top of the element: the effect
 * is at full strength above `from` and gone below `to`. */
export type MixFade = { from: number; to: number };

export type MixOptions = {
	/** 0..1, how much of the effect shows. Default 1. */
	opacity?: number;
	fade?: MixFade;
	/**
	 * What "none of the effect" looks like. `'input'` (the default) is the
	 * effect's own input, which is right for grain and for most library
	 * effects. A colour suits an effect whose output is not an image of its
	 * input — see `SOFT_LIGHT_NEUTRAL`. Fixed at construction, because it
	 * decides which stages the group has.
	 */
	toward?: 'input' | Rgba;
};

/**
 * Soft-light's identity: a 50% grey blend layer leaves the page beneath it
 * exactly as it was (`Cs = 0.5 ⇒ B = Cb`).
 *
 * The halftone fades to this rather than to its input. Its output is an
 * opaque grayscale screen that the provider soft-lights over the page, so
 * mixing back to the input — the page capture — would soft-light the page
 * over itself and boost its contrast wherever the screen had faded out.
 * Grain added after it then sits on neutral grey, so what reaches the page
 * there is the grain alone.
 */
export const SOFT_LIGHT_NEUTRAL: Rgba = [0.5, 0.5, 0.5, 1];

/**
 * Positions are element-local buffer pixels from `uvContent`, not
 * `gl_FragCoord`, because the final stage draws into a viewport offset inside
 * VFX's shared canvas. `fadeFrom` / `fadeTo` are buffer px from the top.
 */
const FADE_GLSL = `
uniform vec2 elementPixel;
uniform float opacity;
uniform float fadeFrom;
uniform float fadeTo;

float amount() {
	float fromTop = elementPixel.y - uvContent.y * elementPixel.y;
	return opacity * (1.0 - smoothstep(fadeFrom, fadeTo, fromTop));
}`;

const TOWARD_COLOUR_FRAG = `#version 300 es
precision highp float;
in vec2 uvContent;
in vec2 uvSrc;
out vec4 outColor;
uniform sampler2D src;
uniform vec4 toward;
${FADE_GLSL}

void main() {
	// Premultiplied, as VFX composites, so a translucent \`toward\` works.
	vec4 neutral = vec4(toward.rgb * toward.a, toward.a);
	outColor = mix(neutral, texture(src, uvSrc), amount());
}`;

const TOWARD_INPUT_FRAG = `#version 300 es
precision highp float;
in vec2 uvContent;
in vec2 uvSrc;
out vec4 outColor;
uniform sampler2D src;
uniform sampler2D saved;
// The saved input's rect, element-local buffer px: [x, y, w, h].
uniform vec4 savedRect;
${FADE_GLSL}

void main() {
	vec2 pixel = uvContent * elementPixel;
	vec2 savedUv = clamp((pixel - savedRect.xy) / savedRect.zw, 0.0, 1.0);
	outColor = mix(texture(saved, savedUv), texture(src, uvSrc), amount());
}`;

/** Where no fade is set: past any element, so the mask is 1 everywhere.
 * Two distinct values, because smoothstep with equal edges is undefined. */
const NO_FADE = { from: 1e9, to: 2e9 };

type InputTap = Effect & {
	readonly saved: EffectRenderTarget | null;
	/** The copy's rect, element-local buffer px. */
	readonly savedRect: readonly [number, number, number, number];
};

/**
 * First stage of a `toward: 'input'` group: passes its input on unchanged and
 * keeps a copy for the blend stage, which otherwise only sees the wrapped
 * effect's output.
 */
function createInputTap(): InputTap {
	let saved: EffectRenderTarget | null = null;
	let savedRect: readonly [number, number, number, number] = [0, 0, 1, 1];
	return {
		get saved() {
			return saved;
		},
		get savedRect() {
			return savedRect;
		},
		init(ctx) {
			// Sized to this stage's output, and resized with it by VFX.
			saved = ctx.createRenderTarget();
		},
		render(ctx) {
			ctx.blit(ctx.src, ctx.target);
			if (saved) {
				ctx.blit(ctx.src, saved);
			}
			// The stage inherits its input's rect, so its output — and the
			// copy — cover `srcRect`.
			const [x, y, width, height] = ctx.dims.srcRect;
			savedRect = [x, y, width, height];
		},
		dispose() {
			saved?.dispose();
			saved = null;
		}
	};
}

/** Last stage: the wrapped effect's output, mixed toward "none of it". */
function createMixBlend(group: Mix, tap: InputTap | null): Effect {
	return {
		render(ctx: EffectContext) {
			const { pixelRatio, src, target } = ctx;
			const { fade = NO_FADE, opacity, toward } = group;
			const [elementWidth, elementHeight] = ctx.dims.elementPixel;
			const common = {
				src,
				elementPixel: [elementWidth, elementHeight] as [number, number],
				opacity,
				fadeFrom: fade.from * pixelRatio,
				fadeTo: fade.to * pixelRatio
			};
			if (toward !== 'input') {
				const [red, green, blue, alpha] = toward;
				ctx.draw({
					frag: TOWARD_COLOUR_FRAG,
					uniforms: { ...common, toward: [red, green, blue, alpha] },
					target
				});
				return;
			}
			const saved = tap?.saved;
			if (!(tap && saved)) {
				ctx.blit(src, target);
				return;
			}
			const [x, y, width, height] = tap.savedRect;
			ctx.draw({
				frag: TOWARD_INPUT_FRAG,
				uniforms: { ...common, saved, savedRect: [x, y, width, height] },
				target
			});
		}
	};
}

/**
 * An effect (or group) at a given opacity, optionally faded out down the
 * element. Made with `mix()`.
 *
 * VFX-JS has no per-effect opacity: its one opacity setting, `overlay`, dims
 * the source element, and every element draws into one shared canvas, so CSS
 * can only fade all of them together. This is three chain stages instead of
 * a wrapper around the inner effect's `render()`, because an effect that
 * draws to its stage's default target would bypass a wrapper's context
 * entirely; as stages, any effect works — ours or the library's.
 */
export class Mix implements EffectGroup {
	opacity = $state(1);
	fade: MixFade | undefined = $state();
	readonly toward: 'input' | Rgba;
	readonly effects: readonly Effect[];
	readonly #inner: EffectInput;

	constructor(inner: EffectInput, options: MixOptions = {}) {
		this.#inner = inner;
		this.opacity = options.opacity ?? this.opacity;
		this.fade = options.fade;
		this.toward = options.toward ?? 'input';
		const tap = this.toward === 'input' ? createInputTap() : null;
		const blend = createMixBlend(this, tap);
		this.effects = [...(tap ? [tap] : []), ...flattenEffects(inner), blend];
	}

	get animating(): boolean {
		return this.#inner.animating === true;
	}

	track(): void {
		void [this.opacity, this.fade?.from, this.fade?.to];
		this.#inner.track?.();
	}
}

export function mix(inner: EffectInput, options: MixOptions = {}): Mix {
	return new Mix(inner, options);
}
