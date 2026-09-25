import type { Effect } from '@vfx-js/core';

/**
 * How the effects in this directory plug into the Svelte layer in
 * `$lib/vfx`. Two additions to VFX-JS's own `Effect`, both optional, so a
 * library effect from `@vfx-js/effects` is a valid input as it stands:
 *
 * - `track()` reads every reactive parameter. The `vfx` attachment calls it
 *   inside an effect, so assigning one (`halftone.contrast = 0.5`) redraws
 *   once, and a still page draws nothing. A library effect has no reactive
 *   parameters: after its `setParams()`, call `invalidate()` on the host
 *   yourself.
 * - `animating` is true while the effect changes with time on its own. The
 *   provider runs VFX's frame loop only while something attached says so.
 *
 * An `EffectGroup` is several effects that behave as one (see `mix()`), and
 * is flattened into the chain VFX sees.
 */
export type Reactive = {
	track?: () => void;
	readonly animating?: boolean;
};

export type EffectGroup = Reactive & {
	/** The effects to splice into the chain, in order. The same instances
	 * every time: VFX keeps an effect's state across a chain swap by
	 * reference. */
	readonly effects: readonly Effect[];
};

export type EffectInput = (Effect & Reactive) | EffectGroup;

/** The `effect` option: one input or a chain of them, as VFX's own `effect`. */
export type EffectOption = EffectInput | readonly EffectInput[];

/** The per-stage layout VFX hands `outputRect()` and `ctx.dims`. VFX-JS does
 * not export the type by name. */
export type EffectDims = Parameters<NonNullable<Effect['outputRect']>>[0];

function isGroup(input: EffectInput): input is EffectGroup {
	return 'effects' in input && Array.isArray(input.effects);
}

function inputsOf(option: EffectOption | undefined): readonly EffectInput[] {
	if (option === undefined) {
		return [];
	}
	// An array is a chain; anything else is a single input — an effect
	// class never extends Array.
	return Array.isArray(option) ? option : [option as EffectInput];
}

/** The chain VFX sees: groups spliced in place. */
export function flattenEffects(option: EffectOption | undefined): Effect[] {
	return inputsOf(option).flatMap((input) => (isGroup(input) ? [...input.effects] : [input]));
}

/** Reads every reactive parameter of every input, for an effect to depend on. */
export function trackEffects(option: EffectOption | undefined): void {
	for (const input of inputsOf(option)) {
		input.track?.();
	}
}

export function anyAnimating(option: EffectOption | undefined): boolean {
	return inputsOf(option).some((input) => input.animating === true);
}
