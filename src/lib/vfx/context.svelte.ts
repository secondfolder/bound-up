import type { Effect, VFX, VFXProps } from '@vfx-js/core';
import { createContext, untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { anyAnimating, type EffectOption, flattenEffects, trackEffects } from '$lib/effects/types';

/**
 * The Svelte side of VFX-JS: one shared `VFX` instance per `VfxProvider`,
 * reached through context, and an attachment that registers an element with
 * it. Modelled on `@vfx-js/react` — a provider, elements opted in with
 * `VFXProps` — but in Svelte's idiom: context from `createContext`, an
 * attachment on any element instead of a component per tag, and effect
 * parameters as `$state` instead of `setParams()`. See docs/page-effects.md.
 */

/** `VFXProps`, with `effect` widened to take our groups (see `mix()`). */
export type VfxAttachOptions = Omit<VFXProps, 'effect'> & {
	effect?: EffectOption;
};

function sameChain(a: readonly Effect[], b: readonly Effect[]): boolean {
	return a.length === b.length && a.every((effect, index) => effect === b[index]);
}

export class VfxHost {
	/** Null until `@vfx-js/core` has loaded, and for good without WebGL2. */
	vfx: VFX | null = $state.raw(null);
	/** Elements whose registration has landed. */
	registered = $state(0);
	#animating = $state(0);
	#frame = 0;
	#disposed = false;

	/** Whether any attached effect changes with time on its own. */
	get animating(): boolean {
		return this.#animating > 0;
	}

	/**
	 * Draws once, on the next frame, however many times it is asked in this
	 * one. The provider runs with VFX's loop off, so this is how anything
	 * that changes what is drawn gets it on screen.
	 */
	invalidate(): void {
		if (this.#frame !== 0 || this.#disposed) {
			return;
		}
		this.#frame = requestAnimationFrame(() => {
			this.#frame = 0;
			this.vfx?.render();
		});
	}

	/** Re-reads an element's pixels — for a canvas, after drawing into it. */
	rerender(element: HTMLElement): void {
		void this.vfx?.update(element);
		this.invalidate();
	}

	dispose(): void {
		this.#disposed = true;
		cancelAnimationFrame(this.#frame);
		this.#frame = 0;
	}

	/**
	 * `{@attach host.attach(() => ({ effect, overlay }))}`: renders the
	 * element through VFX with the given options.
	 *
	 * A getter, not an object, so that the options are read inside effects of
	 * the attachment's own and changing them does not tear it down:
	 *
	 * - A new `effect` swaps the chain in place (`vfx.updateEffects()`, as
	 *   `@vfx-js/react` does), keeping the source texture and the state of
	 *   every effect that stayed.
	 * - A reactive parameter of an effect (`halftone.contrast = 0.5`) redraws
	 *   once and changes nothing else.
	 * - Every other option is read when the element is added.
	 */
	attach(getOptions: () => VfxAttachOptions): Attachment<HTMLElement> {
		return (node) => {
			let added = $state(false);
			let chain: Effect[] = [];

			$effect(() => {
				const { vfx } = this;
				if (!vfx) {
					return;
				}
				const { effect, ...props } = untrack(getOptions);
				chain = flattenEffects(effect);
				let cancelled = false;
				vfx.add(node, { ...props, effect: chain }).then(
					() => {
						if (cancelled) {
							vfx.remove(node);
							return;
						}
						added = true;
						this.registered += 1;
						this.invalidate();
					},
					(error: unknown) => {
						// Most often an effect's init() failing — a shader that
						// would not compile, say. Loud, so the e2e console net
						// catches it.
						console.error('VFX-JS could not add an element:', error);
					}
				);
				return () => {
					cancelled = true;
					if (untrack(() => added)) {
						added = false;
						this.registered -= 1;
						vfx.remove(node);
						this.invalidate();
					}
				};
			});

			$effect(() => {
				const next = flattenEffects(getOptions().effect);
				const { vfx } = this;
				if (!(added && vfx) || sameChain(next, chain)) {
					return;
				}
				chain = next;
				vfx.updateEffects(node, next).then(
					() => this.invalidate(),
					(error: unknown) => console.error('VFX-JS could not swap an effect chain:', error)
				);
			});

			$effect(() => {
				trackEffects(getOptions().effect);
				untrack(() => this.invalidate());
			});

			$effect(() => {
				if (!anyAnimating(getOptions().effect)) {
					return;
				}
				untrack(() => {
					this.#animating += 1;
				});
				return () => {
					this.#animating -= 1;
				};
			});
		};
	}
}

export const [getVfx, setVfx] = createContext<VfxHost>();
