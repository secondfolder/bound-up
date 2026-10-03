import { describe, expect, it } from 'vitest';
import { defined } from '$lib/testing/defined';
import type { RealtimeNamespace } from './binding';
import { createDurableObjectNotifier } from './remote';

/**
 * The worker side of the Durable Object notifier.
 *
 * The object itself is covered by `durable-object.test.ts`; this is about what
 * the worker does with the object's Response before SvelteKit gets it.
 */

/** A namespace whose one room answers every request with `respond()`. */
function fakeNamespace(respond: (url: string) => Promise<Response>) {
	const requested: string[] = [];
	const namespace: RealtimeNamespace = {
		idFromName: (name) => ({ toString: () => name }),
		get: () => ({
			fetch: async (input) => {
				const url = typeof input === 'string' ? input : input.url;
				requested.push(url);
				return await respond(url);
			}
		})
	};
	return { namespace, requested };
}

describe('createDurableObjectNotifier().stream', () => {
	it('returns a Response whose headers SvelteKit can still add cookies to', async () => {
		// A fetched Response has immutable headers, as a Durable Object stub's
		// does. Passing one straight through made SvelteKit's `Set-Cookie`
		// append throw whenever the request also refreshed the session.
		const { namespace } = fakeNamespace(
			async () => await fetch('data:text/event-stream,:ok%0A%0A')
		);
		const response = await createDurableObjectNotifier(namespace).stream('p-1', {
			userId: 'u-1',
			deviceId: null
		});

		expect(() => response.headers.append('set-cookie', 'session=x')).not.toThrow();
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		const body = await new Response(defined(response.body, 'the stream body')).text();
		expect(body).toBe(':ok\n\n');
	});

	it('names the user and device to the room', async () => {
		const { namespace, requested } = fakeNamespace(async () => new Response(''));
		await createDurableObjectNotifier(namespace).stream('p-1', {
			userId: 'u-1',
			deviceId: 'd-1'
		});

		const url = new URL(defined(requested[0], 'the subscribe request'));
		expect(url.pathname).toBe('/subscribe');
		expect(url.searchParams.get('user')).toBe('u-1');
		expect(url.searchParams.get('device')).toBe('d-1');
	});
});
