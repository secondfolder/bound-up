import type { ActionResult } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CELEBRATION_MS, ItemAction } from './item-action.svelte';
import { currentRequestFailure, dismissRequestFailure } from './request-failure.svelte';

vi.mock('svelte/motion', async (original) => ({
	...(await original<typeof import('svelte/motion')>()),
	prefersReducedMotion: { current: false }
}));

type Input = Parameters<ReturnType<ItemAction['enhance']>>[0];

/** Starts a submit the way `use:enhance` does, and returns its result callback. */
function submit(action: ItemAction, id: string) {
	const cancel = vi.fn();
	const after = action.enhance(id)({ cancel } as unknown as Input);
	return { cancel, after };
}

function finish(after: unknown, result: ActionResult, update = vi.fn(() => Promise.resolve())) {
	const callback = after as (opts: {
		result: ActionResult;
		update: typeof update;
	}) => Promise<void>;
	return { done: callback({ result, update }), update };
}

afterEach(() => {
	vi.useRealTimers();
	dismissRequestFailure();
});

describe('ItemAction', () => {
	it('celebrates a success before refreshing the page under it', async () => {
		vi.useFakeTimers();
		const action = new ItemAction();
		const { after } = submit(action, 't1');
		expect(action.waiting('t1')).toBe(true);

		const { done, update } = finish(after, { type: 'success', status: 200 });
		await vi.advanceTimersByTimeAsync(0);
		expect(action.celebrating).toBe('t1');
		// Not shown disabled while it celebrates: a dimmed check reads as a failure.
		expect(action.waiting('t1')).toBe(false);
		expect(update).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(CELEBRATION_MS);
		await done;
		expect(update).toHaveBeenCalledOnce();
		expect(action.celebrating).toBeNull();
		expect(action.pending).toBeNull();
	});

	it('refuses a second press of the same card while the first is in flight', () => {
		const action = new ItemAction();
		submit(action, 't1');
		const { cancel } = submit(action, 't1');
		expect(cancel).toHaveBeenCalledOnce();
	});

	it('hands a refusal to the page at once, without celebrating', async () => {
		const action = new ItemAction();
		const { after } = submit(action, 't1');
		const { done, update } = finish(after, { type: 'failure', status: 400, data: { error: 'No' } });
		await done;
		expect(update).toHaveBeenCalledOnce();
		expect(action.celebrating).toBeNull();
	});

	it('reports an error to the app-wide notice rather than swapping the page out', async () => {
		const action = new ItemAction();
		const { after } = submit(action, 't1');
		const { done, update } = finish(after, { type: 'error', error: new TypeError('offline') });
		await done;
		expect(update).not.toHaveBeenCalled();
		expect(currentRequestFailure()).not.toBeNull();
	});
});
