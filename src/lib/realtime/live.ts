/**
 * Watching a realtime room, from the browser.
 *
 * BROWSER ONLY. Opens an `EventSource` against `/api/realtime/events` for one
 * room (a partnership, or the viewer's own account) and a few topics, and
 * hands each frame to the caller by topic. What a frame may say is each
 * feature's business: message frames are metadata only, notebook frames are
 * sealed ciphertext. This file never looks inside one. See docs/realtime.md.
 *
 * ## The visibility gate is not an optimisation
 *
 * A Durable Object is billed at 128 MB × wall-clock for as long as it holds an
 * in-flight request, and only *hibernation-eligible* idleness is free;
 * hibernation needs the WebSocket Hibernation API, which SSE cannot use. So one
 * permanently-open stream is roughly 10,800 GB-s a day: about 83% of the free
 * plan's 13,000 GB-s daily allowance, for a single partnership sitting idle in a
 * background tab.
 *
 * Hanging up on `visibilitychange` turns that into "billed while someone is
 * actually looking". The step that makes it *safe* is the resync: on becoming
 * visible again this calls `onResync` once, unconditionally, before any frame
 * arrives. Anything that happened while hung up was never delivered and never
 * will be, so without that call the gate would silently cost correctness
 * instead of money. Do not remove one without the other.
 *
 * ## Reconnection
 *
 * `EventSource` retries on its own, but eagerly and with no ceiling, so a
 * server restart turns into a tight loop across every open tab. So `onerror`
 * closes the stream and reschedules by hand at `min(1000 · 2^n, 30_000)` with
 * ±20% jitter, and the attempt counter resets on the first frame received
 * rather than on connect: a proxy that accepts the connection and then drops it
 * would otherwise never look like a failure.
 *
 * A stream that keeps failing falls back to slow polling (`onResync` on a
 * timer) while visible. That is for the real case of an intermediary which
 * buffers `text/event-stream` indefinitely: the connection looks healthy and
 * simply never delivers, which no amount of reconnecting fixes.
 *
 * ## Presence: the stream is a lease
 *
 * The server cannot see this page hang up. On Workers, closing the
 * `EventSource` never reaches the Durable Object, so a phone that had left the
 * board stayed listed as watching it, and a device listed as watching is not
 * sent push notifications (docs/notifications.md). So every connection carries
 * a random `stream` id, renews its lease every `PRESENCE_INTERVAL_MS` while it
 * is open, and says goodbye as it closes, by beacon so the goodbye survives the
 * page going away. A stream the server stops hearing from is closed once
 * `PRESENCE_TTL_MS` (in `server/realtime/index.ts`) runs out, which covers a
 * goodbye that never got out.
 *
 * Each renewal is a request to the worker and on to the Durable Object, made
 * only while the page is on screen: the same visibility gate as the stream.
 */

import { storedPushDeviceId } from '$lib/push-client';

/** A room, as the server names it: `partnership:<id>` or `user:<id>`. */
export type RoomKey = `partnership:${string}` | `user:${string}`;

export function partnershipRoom(partnershipId: string): RoomKey {
	return `partnership:${partnershipId}`;
}

export function userRoom(userId: string): RoomKey {
	return `user:${userId}`;
}

const MAX_BACKOFF_MS = 30_000;
/** After this many consecutive failures, stop trusting SSE and poll instead. */
const FALLBACK_AFTER_FAILURES = 4;
const POLL_INTERVAL_MS = 20_000;
/**
 * How often an open stream renews its lease.
 *
 * Must stay comfortably under the server's `PRESENCE_TTL_MS` (60 s), which is
 * set to outlast two of these so that one lost renewal does not close a stream
 * that is still on screen. Matches the server's keepalive, for no deeper reason
 * than that 25 s is already the cadence this feature runs at.
 */
const PRESENCE_INTERVAL_MS = 25_000;

export const EVENTS_PATH = '/api/realtime/events';
export const PRESENCE_PATH = '/api/realtime/presence';

/** Whether the stream is delivering, retrying, or has given up and is polling. */
export type LiveStatus = 'connecting' | 'live' | 'polling';

export type WatchOptions = {
	room: RoomKey;
	/** Fixed for the life of the watch: a stream's topics are authorised when it opens. */
	topics: readonly string[];
	/** Called for every frame, with the topic it arrived on and its raw data. */
	onFrame: (topic: string, data: string) => void;
	/**
	 * Called when frames may have been missed: on becoming visible again, on
	 * every poll once the stream has fallen back to polling, and after a
	 * reconnect. Idempotent by requirement: it is called speculatively.
	 */
	onResync: () => void;
	/** Told whenever the stream's state changes, for a status line. */
	onStatus?: (status: LiveStatus) => void;
};

/**
 * Starts watching. Returns the teardown, for an `$effect`'s cleanup.
 *
 * Safe to call during SSR: it no-ops outside a browser, so a caller does not
 * need its own guard.
 */
export function watchRoom(options: WatchOptions): () => void {
	// `document`, not `EventSource`: Node has a global EventSource of its own,
	// and a server render must not open a stream.
	if (typeof document === 'undefined' || typeof EventSource === 'undefined') {
		return () => {
			// Nothing was opened, so there is nothing to close.
		};
	}

	const { room, topics, onFrame, onResync, onStatus } = options;
	// Which push device is watching, so the server can skip pushing to the
	// screen that is already showing the change. See docs/notifications.md.
	const device = storedPushDeviceId();

	let source: EventSource | null = null;
	/** The open stream's id, for its renewals and its goodbye. */
	let streamId: string | null = null;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let poll: ReturnType<typeof setInterval> | undefined;
	let renew: ReturnType<typeof setInterval> | undefined;
	let failures = 0;
	let stopped = false;
	/** Whether a stream has dropped, so the next one to open should resync. */
	let reconnecting = false;

	/**
	 * Tells the server this stream is still on screen, or has gone.
	 *
	 * A beacon rather than `tryFetch`: the goodbye is sent as the page goes away,
	 * which only a beacon is built to survive, and nobody is waiting on either
	 * kind. A lost one is covered by the next renewal or by the lease running
	 * out, so failing silently is right here.
	 */
	function sendPresence(stream: string, present: boolean) {
		navigator.sendBeacon(PRESENCE_PATH, JSON.stringify({ room, stream, present }));
	}

	function clearTimers() {
		if (retry) {
			clearTimeout(retry);
		}
		if (poll) {
			clearInterval(poll);
		}
		retry = undefined;
		poll = undefined;
	}

	function disconnect() {
		clearTimers();
		if (renew) {
			clearInterval(renew);
			renew = undefined;
		}
		if (source && streamId) {
			sendPresence(streamId, false);
		}
		source?.close();
		source = null;
		streamId = null;
	}

	function startPolling() {
		if (poll) {
			return;
		}
		onStatus?.('polling');
		poll = setInterval(() => {
			if (!stopped && document.visibilityState === 'visible') {
				onResync();
			}
		}, POLL_INTERVAL_MS);
	}

	function received(topic: string, data: string) {
		// Reset here rather than in `onopen`: an intermediary can accept the
		// connection and then never forward anything, and only a delivered
		// frame proves the whole path works.
		failures = 0;
		onStatus?.('live');
		onFrame(topic, data);
	}

	function connect() {
		if (stopped || source || document.visibilityState !== 'visible') {
			return;
		}

		if (failures >= FALLBACK_AFTER_FAILURES) {
			startPolling();
			return;
		}

		onStatus?.('connecting');
		const stream = crypto.randomUUID();
		streamId = stream;
		const query = new URLSearchParams({ room, stream });
		for (const topic of topics) {
			query.append('topic', topic);
		}
		if (device) {
			query.set('device', device);
		}
		source = new EventSource(`${EVENTS_PATH}?${query}`);
		renew = setInterval(() => sendPresence(stream, true), PRESENCE_INTERVAL_MS);

		// Frames are named by topic, so each is listened for by name: an unnamed
		// `onmessage` never fires for them.
		for (const topic of topics) {
			source.addEventListener(topic, (message) => {
				received(topic, (message as MessageEvent<string>).data);
			});
		}
		/**
		 * Open once the preamble arrives, which is when this stream is
		 * subscribed in the room. After a dropped stream, that is the moment to
		 * catch up: anything published while it was down was never sent, and
		 * resyncing any earlier could miss what was published in between.
		 */
		source.onopen = () => {
			onStatus?.('live');
			if (reconnecting) {
				reconnecting = false;
				onResync();
			}
		};

		source.onerror = () => {
			// EventSource would retry on its own, immediately and forever, so the
			// connection is closed first and rescheduled below.
			disconnect();
			if (stopped) {
				return;
			}

			failures += 1;
			reconnecting = true;
			if (failures >= FALLBACK_AFTER_FAILURES) {
				startPolling();
				return;
			}

			onStatus?.('connecting');
			const base = Math.min(1000 * 2 ** (failures - 1), MAX_BACKOFF_MS);
			// ±20% so a server coming back up does not get every client at once.
			const jittered = base * (0.8 + Math.random() * 0.4);
			retry = setTimeout(connect, jittered);
		};
	}

	function onVisibilityChange() {
		if (stopped) {
			return;
		}
		if (document.visibilityState === 'visible') {
			// The unconditional resync that makes hanging up safe; see the note at
			// the top. It comes BEFORE reconnecting, so the gap is closed even if
			// the connection itself fails.
			onResync();
			connect();
		} else {
			disconnect();
		}
	}

	document.addEventListener('visibilitychange', onVisibilityChange);
	connect();

	return () => {
		stopped = true;
		document.removeEventListener('visibilitychange', onVisibilityChange);
		disconnect();
	};
}
