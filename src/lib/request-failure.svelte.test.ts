import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	currentRequestFailure,
	describeRequestFailure,
	dismissRequestFailure,
	GENERIC_FAILURE,
	NETWORK_FAILURE,
	reportRequestFailure,
	SERVER_FAILURE,
	tryFetch
} from './request-failure.svelte';

afterEach(() => {
	dismissRequestFailure();
	vi.unstubAllGlobals();
});

describe('describeRequestFailure', () => {
	it.each([
		[null, NETWORK_FAILURE],
		[new TypeError('Failed to fetch'), NETWORK_FAILURE],
		[new DOMException('timed out', 'TimeoutError'), NETWORK_FAILURE],
		[new Response(null, { status: 500 }), SERVER_FAILURE],
		[new Response(null, { status: 503 }), SERVER_FAILURE],
		[new Response(null, { status: 429 }), 'Too many attempts. Wait a minute, then try again.'],
		[new Error('something odd'), GENERIC_FAILURE]
	])('words %s', (cause, expected) => {
		expect(describeRequestFailure(cause)).toBe(expected);
	});

	/** The shape superforms' `onError` and `use:enhance` hand over. */
	it('reads an action error result by its status', () => {
		expect(describeRequestFailure({ type: 'error', status: 500, error: { message: 'x' } })).toBe(
			SERVER_FAILURE
		);
	});

	/**
	 * A submit that never got an answer arrives as an error result too, with a
	 * made-up status. Reading the status alone would blame the server for the
	 * person's own connection.
	 */
	it('sees a network failure inside an error result, whatever its status says', () => {
		expect(
			describeRequestFailure({
				type: 'error',
				status: 500,
				error: new TypeError('Failed to fetch')
			})
		).toBe(NETWORK_FAILURE);
	});
});

describe('tryFetch', () => {
	it('turns a request that got no answer into null', async () => {
		vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
		await expect(tryFetch('/anything')).resolves.toBeNull();
	});

	it('passes an answer through, error status and all', async () => {
		vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 500 })));
		expect((await tryFetch('/anything'))?.status).toBe(500);
	});

	/** Cancelling on purpose is not a failure to tell anyone about. */
	it('still throws an abort', async () => {
		vi.stubGlobal('fetch', () => Promise.reject(new DOMException('aborted', 'AbortError')));
		await expect(tryFetch('/anything')).rejects.toThrow('aborted');
	});
});

describe('reportRequestFailure', () => {
	it('shows the latest failure, with its own words when the site has them', () => {
		reportRequestFailure(null);
		expect(currentRequestFailure()?.message).toBe(NETWORK_FAILURE);
		reportRequestFailure(null, "Couldn't refresh this preview.");
		expect(currentRequestFailure()?.message).toBe("Couldn't refresh this preview.");
		dismissRequestFailure();
		expect(currentRequestFailure()).toBeNull();
	});
});
