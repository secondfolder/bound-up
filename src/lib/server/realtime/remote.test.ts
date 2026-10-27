import { afterEach, describe, expect, it, vi } from 'vitest';
import { defined } from '$lib/testing/defined';
import type { RealtimeNamespace } from './binding';
import { spaceRoom } from './index';
import { createDurableObjectNotifier } from './remote';

/**
 * The worker side of the Durable Object notifier.
 *
 * The object itself is covered by `durable-object.test.ts`; this is about what
 * the worker does with the object's Response before SvelteKit gets it.
 */

afterEach(() => {
	vi.restoreAllMocks();
});

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
		const response = await createDurableObjectNotifier(namespace).stream(spaceRoom('p-1'), {
			watcher: { userId: 'u-1', deviceId: null, streamId: 's-1' },
			topics: ['messages']
		});

		expect(() => response.headers.append('set-cookie', 'session=x')).not.toThrow();
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		const body = await new Response(defined(response.body, 'the stream body')).text();
		expect(body).toBe(':ok\n\n');
	});

	it('names the user, device and stream to the room', async () => {
		const { namespace, requested } = fakeNamespace(async () => new Response(''));
		await createDurableObjectNotifier(namespace).stream(spaceRoom('p-1'), {
			watcher: { userId: 'u-1', deviceId: 'd-1', streamId: 's-1' },
			topics: ['messages', 'notebook']
		});

		const url = new URL(defined(requested[0], 'the subscribe request'));
		expect(url.pathname).toBe('/subscribe');
		expect(url.searchParams.get('user')).toBe('u-1');
		expect(url.searchParams.get('device')).toBe('d-1');
		expect(url.searchParams.get('stream')).toBe('s-1');
		expect(url.searchParams.getAll('topic')).toEqual(['messages', 'notebook']);
	});

	it('addresses the room by its scoped key', async () => {
		const names: string[] = [];
		const namespace: RealtimeNamespace = {
			idFromName: (name) => {
				names.push(name);
				return { toString: () => name };
			},
			get: () => ({ fetch: async () => await Promise.resolve(new Response('')) })
		};
		await createDurableObjectNotifier(namespace).stream(spaceRoom('p-1'), {
			watcher: { userId: 'u-1', deviceId: null, streamId: 's-1' },
			topics: ['messages']
		});
		expect(names).toEqual(['space:p-1']);
	});
});

describe('createDurableObjectNotifier().presence', () => {
	it('passes the update on to the room', async () => {
		const { namespace, requested } = fakeNamespace(async () => new Response(null, { status: 204 }));
		await createDurableObjectNotifier(namespace).presence(spaceRoom('p-1'), {
			userId: 'u-1',
			streamId: 's-1',
			present: false
		});
		expect(new URL(defined(requested[0], 'the presence request')).pathname).toBe('/presence');
	});

	/** A lost renewal is covered by the next, and a lost goodbye by the lease. */
	it('never throws', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { namespace } = fakeNamespace(() => Promise.reject(new Error('room unavailable')));
		await expect(
			createDurableObjectNotifier(namespace).presence(spaceRoom('p-1'), {
				userId: 'u-1',
				streamId: 's-1',
				present: true
			})
		).resolves.toBeUndefined();
	});
});

describe('createDurableObjectNotifier().publish', () => {
	it('sends the topic and the opaque data, and returns who was watching', async () => {
		const bodies: unknown[] = [];
		const namespace: RealtimeNamespace = {
			idFromName: (name) => ({ toString: () => name }),
			get: () => ({
				fetch: async (_input, init) => {
					bodies.push(JSON.parse(String(init?.body)));
					return await Promise.resolve(
						Response.json({ watching: [{ userId: 'u-1', deviceId: null, streamId: 's-1' }] })
					);
				}
			})
		};
		const watching = await createDurableObjectNotifier(namespace).publish(
			spaceRoom('p-1'),
			'notebook',
			'{"kind":"created"}'
		);
		expect(bodies).toEqual([{ topic: 'notebook', data: '{"kind":"created"}' }]);
		expect(watching).toEqual([{ userId: 'u-1', deviceId: null, streamId: 's-1' }]);
	});
});

describe('createDurableObjectNotifier().evict', () => {
	it('passes the eviction on to the room', async () => {
		const { namespace, requested } = fakeNamespace(async () => new Response(null, { status: 204 }));
		await createDurableObjectNotifier(namespace).evict(spaceRoom('p-1'), {
			userId: 'u-1',
			topic: 'notebook-entry:00000000-0000-0000-0000-000000000000'
		});
		expect(new URL(defined(requested[0], 'the evict request')).pathname).toBe('/evict');
	});

	it('never throws', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { namespace } = fakeNamespace(() => Promise.reject(new Error('room unavailable')));
		await expect(
			createDurableObjectNotifier(namespace).evict(spaceRoom('p-1'), {
				userId: 'u-1',
				topic: 'notebook'
			})
		).resolves.toBeUndefined();
	});
});
