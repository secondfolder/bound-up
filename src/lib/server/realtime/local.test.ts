import { afterEach, describe, expect, it, vi } from 'vitest';
import { defined } from '$lib/testing/defined';
import { encodeSseEvent, PRESENCE_TTL_MS, SSE_PREAMBLE, type Watcher } from './index';
import { createLocalNotifier, localRoomSize } from './local';

/**
 * The development notifier's fan-out.
 *
 * Worth testing rather than treating as a stub, because it is the
 * implementation the entire Playwright suite runs against — the Durable Object
 * only exists under `wrangler dev` and in production. If this file is wrong,
 * every live-update test passes or fails for the wrong reason.
 *
 * The module keeps one process-wide table, so each test uses its own
 * partnership id and cancels its readers; a leaked reader would hold a
 * keepalive interval open and stall the run.
 */

const decoder = new TextDecoder();

/** Subscribes and returns a reader plus a way to let go of it. */
async function subscribe(
	notifier: ReturnType<typeof createLocalNotifier>,
	id: string,
	watcher: Watcher = { userId: 'u-1', deviceId: null, streamId: crypto.randomUUID() }
) {
	const response = await notifier.stream(id, watcher);
	const contentType = response.headers.get('content-type');
	if (contentType !== 'text/event-stream') {
		throw new Error(`Expected an event stream, got ${contentType}`);
	}
	const reader = defined(response.body, 'the stream body').getReader();

	// Every stream opens with a comment frame. Not cosmetic: EventSource does not
	// fire `onopen` until something arrives, so without it a client cannot tell
	// "connected and idle" from "still connecting".
	const preamble = decoder.decode((await reader.read()).value);
	if (preamble !== SSE_PREAMBLE) {
		throw new Error(`Expected the preamble first, got ${JSON.stringify(preamble)}`);
	}

	return { reader, release: () => reader.cancel() };
}

describe('the local notifier', () => {
	it('delivers an event to every subscriber of that partnership', async () => {
		const notifier = createLocalNotifier();
		const a = await subscribe(notifier, 'p-fanout');
		const b = await subscribe(notifier, 'p-fanout');

		await notifier.publish('p-fanout', { kind: 'message', threadId: 't-1' });

		for (const side of [a, b]) {
			const frame = await side.reader.read();
			expect(decoder.decode(frame.value)).toBe(
				encodeSseEvent({ kind: 'message', threadId: 't-1' })
			);
		}

		await a.release();
		await b.release();
	});

	/**
	 * The isolation that makes one object per partnership meaningful. A leak here
	 * would tell one couple, in real time, exactly when another was messaging.
	 */
	it('never delivers across partnerships', async () => {
		const notifier = createLocalNotifier();
		const mine = await subscribe(notifier, 'p-mine');
		const theirs = await subscribe(notifier, 'p-theirs');

		await notifier.publish('p-theirs', { kind: 'thread' });

		// Their stream got it...
		const got = await theirs.reader.read();
		expect(decoder.decode(got.value)).toBe(encodeSseEvent({ kind: 'thread' }));

		// ...and mine has nothing pending. Raced against a resolved promise rather
		// than a timer, because a `read()` on an idle stream never settles and a
		// timeout would just make this test slow.
		const pending = await Promise.race([
			mine.reader.read().then(() => 'delivered'),
			Promise.resolve('nothing')
		]);
		expect(pending).toBe('nothing');

		await mine.release();
		await theirs.release();
	});

	it('forgets a subscriber that hangs up, and empties the room', async () => {
		const notifier = createLocalNotifier();
		const one = await subscribe(notifier, 'p-hangup');
		const two = await subscribe(notifier, 'p-hangup');
		expect(localRoomSize('p-hangup')).toBe(2);

		await one.release();
		expect(localRoomSize('p-hangup')).toBe(1);

		await two.release();
		// The room itself goes, not just its members — otherwise a long-lived dev
		// server accumulates an empty Map per partnership ever opened.
		expect(localRoomSize('p-hangup')).toBe(0);
	});

	/**
	 * `publish` is declared as never throwing, and this is the common case: the
	 * sender's own request publishes whether or not anyone is listening.
	 */
	it('is a no-op when nobody is listening', async () => {
		const notifier = createLocalNotifier();
		await expect(notifier.publish('p-empty', { kind: 'reaction' })).resolves.toEqual([]);
	});

	/**
	 * What lets a push be skipped for a device that already has the board open
	 * — see `watchingDevices` in `$lib/server/push`. Gone listeners must not be
	 * reported, or a device that hung up would never be pushed to.
	 */
	it('reports who is watching, and stops reporting a listener once it hangs up', async () => {
		const notifier = createLocalNotifier();
		const adaWatcher = { userId: 'ada', deviceId: 'd-ada', streamId: 's-ada' };
		const boWatcher = { userId: 'bo', deviceId: null, streamId: 's-bo' };
		const ada = await subscribe(notifier, 'p-watchers', adaWatcher);
		const bo = await subscribe(notifier, 'p-watchers', boWatcher);

		expect(await notifier.publish('p-watchers', { kind: 'thread' })).toEqual([
			adaWatcher,
			boWatcher
		]);

		await ada.release();
		expect(await notifier.publish('p-watchers', { kind: 'thread' })).toEqual([boWatcher]);
		await bo.release();
	});
});

/**
 * Each stream is a lease its page renews, because on Workers a browser hanging
 * up never reaches the room — see `PRESENCE_TTL_MS`. The local notifier keeps
 * the same rule, so the Playwright suite runs against what production relies
 * on. Fake timers, because the lease is measured in tens of seconds.
 */
describe('the local notifier: presence', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	const phone = { userId: 'ada', deviceId: 'd-phone', streamId: 's-phone' };

	it('stops reporting a stream once its page says goodbye, and closes it', async () => {
		const notifier = createLocalNotifier();
		const side = await subscribe(notifier, 'p-goodbye', phone);

		await notifier.presence('p-goodbye', { userId: 'ada', streamId: 's-phone', present: false });

		expect(await notifier.publish('p-goodbye', { kind: 'thread' })).toEqual([]);
		// Closed rather than just forgotten, so the stream is not held open.
		expect((await side.reader.read()).done).toBe(true);
	});

	it('ignores a goodbye naming somebody else’s stream', async () => {
		const notifier = createLocalNotifier();
		const side = await subscribe(notifier, 'p-not-yours', phone);

		await notifier.presence('p-not-yours', { userId: 'bo', streamId: 's-phone', present: false });

		expect(await notifier.publish('p-not-yours', { kind: 'thread' })).toEqual([phone]);
		await side.release();
	});

	it('closes a stream whose page stopped renewing it, without a goodbye', async () => {
		vi.useFakeTimers();
		const notifier = createLocalNotifier();
		const side = await subscribe(notifier, 'p-lapsed', phone);

		await vi.advanceTimersByTimeAsync(PRESENCE_TTL_MS + 1);

		expect(await notifier.publish('p-lapsed', { kind: 'thread' })).toEqual([]);
		expect(localRoomSize('p-lapsed')).toBe(0);
		await side.release();
	});

	it('keeps a stream whose page keeps renewing it', async () => {
		vi.useFakeTimers();
		const notifier = createLocalNotifier();
		const side = await subscribe(notifier, 'p-renewed', phone);

		for (let elapsed = 0; elapsed < PRESENCE_TTL_MS * 3; elapsed += 25_000) {
			await vi.advanceTimersByTimeAsync(25_000);
			await notifier.presence('p-renewed', { userId: 'ada', streamId: 's-phone', present: true });
		}

		expect(await notifier.publish('p-renewed', { kind: 'thread' })).toEqual([phone]);
		await side.release();
	});
});
