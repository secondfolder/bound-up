import type { SubmitFunction } from '@sveltejs/kit';
import { prefersReducedMotion } from 'svelte/motion';
import { reportRequestFailure } from '$lib/request-failure.svelte';

/**
 * How long a card celebrates a completed task or a claimed reward before the
 * page's data is refreshed under it. Long enough to see the check or the gift
 * land; short enough that nobody waits for it.
 */
export const CELEBRATION_MS = 600;

/**
 * `use:enhance` for the one-button forms on task and reward cards: Complete
 * and Claim.
 *
 * These used to post natively, which reloaded the whole page — there was no
 * moment in which the card could say "done". Enhanced, a success marks the
 * card as celebrating, holds the refresh for `CELEBRATION_MS` so the motion
 * can play, and then runs SvelteKit's own `update()`: the loads re-run and the
 * action's message lands in the page's `form` exactly as it did before. With
 * reduced motion there is nothing to wait for, so the refresh is immediate.
 *
 * A refusal (`fail()`) still goes through `update()`, so the page shows the
 * action's own error where it always has. An `error` result is the one
 * difference: `update()` would swap the page for the error page, so it goes to
 * the app-wide notice instead (docs/request-failures.md).
 */
export class ItemAction {
	/** The card whose form is in flight, so its button can be disabled. */
	pending = $state<string | null>(null);
	/** The card that has just succeeded and is playing its celebration. */
	celebrating = $state<string | null>(null);

	/**
	 * Waiting on the server, so the button shows disabled. Not while it
	 * celebrates: a dimmed check would read as a failure. A second press then
	 * is refused by `enhance` instead.
	 */
	waiting(id: string): boolean {
		return this.pending === id && this.celebrating !== id;
	}

	enhance(id: string): SubmitFunction {
		return ({ cancel }) => {
			if (this.pending === id) {
				cancel();
				return;
			}
			this.pending = id;
			return async ({ result, update }) => {
				try {
					if (result.type === 'error') {
						reportRequestFailure(result.error);
						return;
					}
					if (result.type === 'success' && !prefersReducedMotion.current) {
						this.celebrating = id;
						await new Promise((done) => setTimeout(done, CELEBRATION_MS));
					}
					await update();
				} finally {
					this.pending = null;
					this.celebrating = null;
				}
			};
		};
	}
}
