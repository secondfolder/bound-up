import { afterEach, describe, expect, it, vi } from 'vitest';
import { defined } from '../../testing/defined';
import { RealtimeRoom } from './durable-object';
import {
	encodeSseEvent,
	PRESENCE_TTL_MS,
	type Presence,
	SSE_KEEPALIVE,
	SSE_KEEPALIVE_MS,
	SSE_PREAMBLE
} from './index';

/**
 * The Durable Object class, exercised directly.
 *
 * This is the one part of the feature that no other level reaches. `vite dev`
 * and the whole Playwright suite use the in-process notifier in `local.ts`; the
 * Durable Object only runs under `wrangler dev` and in production, where the
 * Playwright suite does not point. So without these tests the class would ship
 * having been verified by nothing but "wrangler listed the binding".
 *
 * It runs in plain node because the class deliberately uses no Cloudflare API
 * at all — no storage, no bindings, and `(state, env)` are accepted and then
 * ignored. Everything it touches (`Request`, `Response`, `TransformStream`) is
 * standard and present in node 18+. That is a consequence of the design rather
 * than luck: an object that held storage could not be tested this way.
 *
 * Fake timers throughout, because a subscription arms a 25-second keepalive
 * loop and a real one would either hang the run or leak a handle past it.
 */

const decoder = new TextDecoder();
const ORIGIN = 'https://realtime.invalid';

function room() {
	return new RealtimeRoom();
}

async function subscribe(instance: RealtimeRoom, query = 'user=u-1&stream=s-1') {
	const response = await instance.fetch(new Request(`${ORIGIN}/subscribe?${query}`));
	const contentType = response.headers.get('content-type');
	if (contentType !== 'text/event-stream') {
		throw new Error(`Expected an event stream, got ${contentType}`);
	}
	const reader = defined(response.body, 'the stream body').getReader();

	// The preamble proves the stream is live. EventSource does not fire `onopen`
	// until something arrives, so a client's reconnect backoff depends on it.
	const preamble = decoder.decode((await reader.read()).value);
	if (preamble !== SSE_PREAMBLE) {
		throw new Error(`Expected the preamble first, got ${JSON.stringify(preamble)}`);
	}
	return reader;
}

function publish(instance: RealtimeRoom, body: unknown) {
	return instance.fetch(
		new Request(`${ORIGIN}/publish`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	);
}

afterEach(() => {
	vi.useRealTimers();
});

describe('RealtimeRoom', () => {
	it('broadcasts a published event to every open stream', async () => {
		vi.useFakeTimers();
		const instance = room();
		const a = await subscribe(instance);
		const b = await subscribe(instance);

		const response = await publish(instance, { kind: 'message', threadId: 't-7' });
		expect(response.status).toBe(200);

		for (const reader of [a, b]) {
			expect(decoder.decode((await reader.read()).value)).toBe(
				encodeSseEvent({ kind: 'message', threadId: 't-7' })
			);
		}

		await a.cancel();
		await b.cancel();
	});

	it('accepts a publish with nobody listening', async () => {
		vi.useFakeTimers();
		const instance = room();
		const response = await publish(instance, { kind: 'thread' });
		expect(await response.json()).toEqual({ watching: [] });
	});

	/**
	 * The browser side hangs up every time the page is hidden — see the note in
	 * `live.ts` about that being a billing necessity rather than an optimisation
	 * — so a dropped subscriber is the common case, not an edge one. If it were
	 * not cleaned up, a long-lived room would broadcast to a growing set of dead
	 * writers.
	 */
	it('drops a stream that has hung up, and keeps serving the rest', async () => {
		vi.useFakeTimers();
		const instance = room();
		const staying = await subscribe(instance);
		const leaving = await subscribe(instance);

		await leaving.cancel();

		// The publish must still succeed, and must still reach the live one. A
		// broadcast that threw on the dead writer would take the whole fan-out
		// with it, so this is the assertion that matters.
		expect((await publish(instance, { kind: 'reaction' })).status).toBe(200);
		expect(decoder.decode((await staying.read()).value)).toBe(encodeSseEvent({ kind: 'reaction' }));

		await staying.cancel();
	});

	/** The Durable Object half of what `local.test.ts` checks for the dev notifier. */
	it('reports who is watching after the broadcast, without anyone who hung up', async () => {
		vi.useFakeTimers();
		const instance = room();
		const ada = await subscribe(instance, 'user=ada&device=d-ada&stream=s-ada');
		const bo = await subscribe(instance, 'user=bo&stream=s-bo');
		await bo.cancel();

		const response = await publish(instance, { kind: 'message', threadId: 't-1' });
		expect(await response.json()).toEqual({
			watching: [{ userId: 'ada', deviceId: 'd-ada', streamId: 's-ada' }]
		});

		await ada.cancel();
	});

	it('sends a keepalive so an idle stream is not reaped by a proxy', async () => {
		vi.useFakeTimers();
		const instance = room();
		const reader = await subscribe(instance);

		await vi.advanceTimersByTimeAsync(SSE_KEEPALIVE_MS + 1);

		expect(decoder.decode((await reader.read()).value)).toBe(SSE_KEEPALIVE);
		await reader.cancel();
	});

	/**
	 * Why streams are leases at all: on Workers, a browser closing its
	 * `EventSource` was never seen to reach the room, so a phone that had left
	 * the board went on being reported as watching and was never pushed to.
	 * These cover the page's goodbye, the lease running out without one, and a
	 * renewed lease surviving. See `PRESENCE_TTL_MS`.
	 */
	describe('presence', () => {
		const phone = 'user=ada&device=d-phone&stream=s-phone';

		function presence(instance: RealtimeRoom, body: Presence) {
			return instance.fetch(
				new Request(`${ORIGIN}/presence`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body)
				})
			);
		}

		async function watching(instance: RealtimeRoom) {
			const response = await publish(instance, { kind: 'thread' });
			return ((await response.json()) as { watching: unknown[] }).watching;
		}

		it('stops reporting a stream once its page says goodbye, and closes it', async () => {
			vi.useFakeTimers();
			const instance = room();
			const reader = await subscribe(instance, phone);

			const response = await presence(instance, {
				userId: 'ada',
				streamId: 's-phone',
				present: false
			});
			expect(response.status).toBe(204);

			expect(await watching(instance)).toEqual([]);
			// Closed rather than just forgotten, so the room stops paying to hold it.
			expect((await reader.read()).done).toBe(true);
		});

		it('ignores a goodbye naming somebody else’s stream', async () => {
			vi.useFakeTimers();
			const instance = room();
			const reader = await subscribe(instance, phone);

			await presence(instance, { userId: 'bo', streamId: 's-phone', present: false });

			expect(await watching(instance)).toEqual([
				{ userId: 'ada', deviceId: 'd-phone', streamId: 's-phone' }
			]);
			await reader.cancel();
		});

		it('stops reporting a stream whose page stopped renewing it', async () => {
			vi.useFakeTimers();
			const instance = room();
			const reader = await subscribe(instance, phone);
			// Read as they come, so the keepalives are not what ends it.
			void (async () => {
				while (!(await reader.read()).done) {
					// Draining.
				}
			})();

			await vi.advanceTimersByTimeAsync(PRESENCE_TTL_MS + 1);

			expect(await watching(instance)).toEqual([]);
		});

		it('closes a lapsed stream on its own, without waiting for a publish', async () => {
			vi.useFakeTimers();
			const instance = room();
			const reader = await subscribe(instance, phone);
			const ended = (async () => {
				while (!(await reader.read()).done) {
					// Draining until the room closes it.
				}
				return 'closed';
			})();

			await vi.advanceTimersByTimeAsync(PRESENCE_TTL_MS + SSE_KEEPALIVE_MS + 1);

			await expect(ended).resolves.toBe('closed');
		});

		it('keeps a stream whose page keeps renewing it', async () => {
			vi.useFakeTimers();
			const instance = room();
			const reader = await subscribe(instance, phone);
			void (async () => {
				while (!(await reader.read()).done) {
					// Draining.
				}
			})();

			for (let elapsed = 0; elapsed < PRESENCE_TTL_MS * 3; elapsed += SSE_KEEPALIVE_MS) {
				await vi.advanceTimersByTimeAsync(SSE_KEEPALIVE_MS);
				await presence(instance, { userId: 'ada', streamId: 's-phone', present: true });
			}

			expect(await watching(instance)).toEqual([
				{ userId: 'ada', deviceId: 'd-phone', streamId: 's-phone' }
			]);
			await reader.cancel();
		});
	});

	it('404s an unknown path rather than throwing', async () => {
		vi.useFakeTimers();
		const instance = room();
		const response = await instance.fetch(new Request(`${ORIGIN}/nope`));
		expect(response.status).toBe(404);
	});
});
