import type { ModelProgress } from '$lib/daydream/progress';

/**
 * Whether to send a progress event now: whenever the stage changes, and
 * otherwise no more often than `everyMs`, so a fast answer is not one event
 * per token.
 */
export class ProgressGate {
	readonly #everyMs: number;
	readonly #now: () => number;
	#lastStage: ModelProgress['stage'] | null = null;
	#lastAt = Number.NEGATIVE_INFINITY;

	constructor(everyMs: number, now: () => number = Date.now) {
		this.#everyMs = everyMs;
		this.#now = now;
	}

	shouldSend(progress: ModelProgress): boolean {
		const at = this.#now();
		if (progress.stage === this.#lastStage && at - this.#lastAt < this.#everyMs) {
			return false;
		}
		this.#lastStage = progress.stage;
		this.#lastAt = at;
		return true;
	}
}
