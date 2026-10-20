import { cutAt, revealStep, sharedStart } from './reveal';

/**
 * A passage arriving, shown at a steady pace rather than in the stream's
 * bursts (`reveal.ts` says why and how fast). Give it the text as it arrives
 * with `set`; `shown` is what to draw. Anyone who prefers reduced motion sees
 * the text as it arrives, as before.
 */
export class SmoothReveal {
	#target = $state('');
	#position = $state(0);
	#frame = 0;
	#last = 0;
	readonly #instant: boolean;

	readonly shown = $derived(this.#target.slice(0, cutAt(this.#target, this.#position)));

	constructor(
		instant = typeof matchMedia === 'function' &&
			matchMedia('(prefers-reduced-motion: reduce)').matches
	) {
		this.#instant = instant;
	}

	set(text: string): void {
		// The visible text only grows while it streams, but a half-arrived tag
		// is shown and then taken back, and a different reply may start over:
		// whatever no longer matches is unshown.
		if (!text.startsWith(this.shown)) {
			this.#position = Math.min(this.#position, sharedStart(this.shown, text));
		}
		this.#target = text;
		if (this.#instant) {
			this.#position = text.length;
		} else if (this.#frame === 0 && this.#position < text.length) {
			this.#last = performance.now();
			this.#frame = requestAnimationFrame(this.#tick);
		}
	}

	readonly #tick = (now: number) => {
		this.#position = revealStep(this.#position, this.#target.length, now - this.#last);
		this.#last = now;
		this.#frame = this.#position < this.#target.length ? requestAnimationFrame(this.#tick) : 0;
	};

	dispose(): void {
		cancelAnimationFrame(this.#frame);
		this.#frame = 0;
	}
}
