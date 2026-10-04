import { vi } from 'vitest';

let current = $state(false);

/**
 * A stand-in for `updated` from `$app/state`, whose `current` a test can set.
 * SvelteKit's own never changes outside a production build — under Vite its
 * `check()` always answers false — so a component that reacts to it needs this:
 *
 *     vi.mock('$app/state', async () => ({
 *       updated: (await import('$lib/testing/updated.svelte')).fakeUpdated
 *     }));
 *
 * Reactive, so setting `current` re-runs the component's effects as a real
 * update would. One instance per test file; reset it in `afterEach`.
 */
export const fakeUpdated = {
	get current() {
		return current;
	},
	set current(value: boolean) {
		current = value;
	},
	check: vi.fn(async () => false)
};
