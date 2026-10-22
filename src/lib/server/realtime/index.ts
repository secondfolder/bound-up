/**
 * Telling other devices that something changed: the app's one realtime room.
 *
 * An interface with two implementations, for the same reason
 * `src/lib/server/db/backend.ts` and `server/media/index.ts` have one each:
 * `svelte.config.js` strips the Cloudflare adapter's `emulate` hook, so
 * `vite dev` has no `event.platform` and therefore no Durable Object binding at
 * all. Production gets a Durable Object; dev gets a module-level `Map`, which
 * is genuinely correct there because dev is one Node process.
 *
 * **One room per scope, many topics per room.** A room is a partnership
 * (`partnership:<id>`) or one account (`user:<id>`), and every realtime feature
 * shares it: partner messaging and the notebook today. A stream names the
 * topics it wants and is sent only those, so a device with a notebook entry
 * open is neither sent message events nor counted as watching the board. One
 * class rather than one per feature because a Durable Object is billed per
 * open stream and request, not per class, and because the lease below is the
 * subtle part, and there should be exactly one copy of it. See
 * docs/realtime.md.
 *
 * **The room treats a frame as an opaque string.** What a frame may say is the
 * publishing feature's rule, not the room's:
 *
 * - **`messages` frames are metadata only, and that is a rule rather than a
 *   convention.** See `MessagingEvent` in `./messaging.ts`: an event says
 *   *that* a partnership changed and, where it helps, which thread, never who
 *   sent it and never a byte of content. The client's entire reaction is to
 *   call `invalidate()`. If a future message event ever wants to carry a body,
 *   that is the moment to stop and reconsider, not a small extension.
 * - **Notebook entry frames carry sealed ciphertext**, because live co-editing
 *   cannot wait for a refetch per keystroke. They are as opaque to the server
 *   as to the room, and are never plaintext. See docs/notebook.md.
 *
 * The one thing a room does know about its listeners is *who* they are (a
 * user id, and the push device they are on if they have one) and only so that
 * `publish` can say who is watching a topic. A device with the board open is
 * already being told; sending it a push notification as well would be noise.
 * See docs/notifications.md.
 *
 * **SSE, not WebSocket**, and the reason is decisive rather than aesthetic:
 * `vite dev` cannot serve a WebSocket upgrade from a `+server.ts` at all, so a
 * socket would need a second client code path used only in development, and
 * the Playwright suite would then never exercise the real one. An SSE stream is
 * a plain streaming `Response` and behaves identically in dev and on Workers.
 *
 * **The Durable Object imports this file**, so it stays alias-free (AGENTS.md
 * invariant 15).
 */

/**
 * Which room: a partnership, or one account on its own.
 *
 * The key is what `idFromName` hashes, so both partners' devices (or all of
 * one account's) derive the same object without an id being stored anywhere.
 */
export type RoomKey = `partnership:${string}` | `user:${string}`;

export function partnershipRoom(partnershipId: string): RoomKey {
	return `partnership:${partnershipId}`;
}

export function userRoom(userId: string): RoomKey {
	return `user:${userId}`;
}

/**
 * Partnership ids are UUIDs; user ids are Better Auth's, which are not, so the
 * id half is any short run of URL-safe characters rather than a UUID.
 */
const ROOM_PATTERN = /^(?:partnership|user):[A-Za-z0-9_-]{1,64}$/;

/** A room key from a request, or `null` for anything that is not one. */
export function parseRoomKey(value: string | null): RoomKey | null {
	return value !== null && ROOM_PATTERN.test(value) ? (value as RoomKey) : null;
}

/** The two halves of a room key, for authorising it. */
export function roomScope(room: RoomKey): { kind: 'partnership' | 'user'; id: string } {
	const separator = room.indexOf(':');
	return {
		kind: room.slice(0, separator) as 'partnership' | 'user',
		id: room.slice(separator + 1)
	};
}

/**
 * A topic: a feature's name, optionally narrowed to one record.
 *
 * `messages`, `notebook`, `notebook-entry:<uuid>`. Kept to a closed shape so a
 * topic is always safe to write into an SSE `event:` line: a newline in one
 * would let it forge frames.
 */
const TOPIC_PATTERN = /^[a-z][a-z-]{0,39}(?::[0-9a-f-]{36})?$/;

export function isTopic(value: string): boolean {
	return TOPIC_PATTERN.test(value);
}

/** The most topics one stream may name: enough for any page, not a firehose. */
export const MAX_TOPICS_PER_STREAM = 8;

/**
 * One open stream's listener.
 *
 * `userId` is set by the events endpoint from the session, never from the
 * request, so a member cannot claim to be the other one. `deviceId` is the
 * listener's own push subscription id, if it has one, as the browser reports
 * it; at worst a wrong one means a push that should have been skipped is sent.
 * `streamId` is random per connection, chosen by the browser, so a presence
 * update names exactly one stream; see `PRESENCE_TTL_MS`.
 */
export type Watcher = {
	userId: string;
	deviceId: string | null;
	streamId: string;
};

/** A stream as the room holds it: whose it is, and which topics it was let in to. */
export type Subscription = {
	watcher: Watcher;
	/** Already authorised, one by one, by the events endpoint. */
	topics: string[];
};

/**
 * A browser saying one of its streams is still on screen, or has gone.
 *
 * Matched on both fields: the user comes from the session, so a member can only
 * ever touch their own streams, whatever stream id they name.
 */
export type Presence = {
	userId: string;
	streamId: string;
	present: boolean;
};

/**
 * Closing one user's streams on one topic, because they may no longer read it.
 *
 * A notebook entry being hidden from a partner is the case: the server stops
 * serving it at once, and this stops the room relaying its edits to a page
 * that is already open. The stream as a whole is closed, not just unsubscribed,
 * because a stream's topics are fixed when it opens; the page reconnects with
 * the topics it may still have.
 */
export type Eviction = {
	userId: string;
	topic: string;
};

export type Notifier = {
	/**
	 * Sends a frame to everyone in a room watching a topic, and returns who that
	 * was.
	 *
	 * `data` is opaque to the room. It must be a single line, which
	 * `JSON.stringify` always is; the publishing feature's own helper decides
	 * what may go in it.
	 *
	 * Must never throw. A realtime failure has to be invisible: the write it
	 * follows has already committed, and turning that into a 500 would make the
	 * client retry a send that actually succeeded. A failure reports nobody
	 * watching, which errs towards sending a push rather than losing one.
	 */
	publish: (room: RoomKey, topic: string, data: string) => Promise<Watcher[]>;
	/** A long-lived SSE `Response` carrying a room's frames for some topics. */
	stream: (room: RoomKey, subscription: Subscription) => Promise<Response>;
	/**
	 * Refreshes a stream's lease, or closes it when its page has gone.
	 *
	 * Never throws, like `publish`, and for a kindred reason: it is fire and
	 * forget from a beacon, and the lease expiring is the fallback anyway.
	 */
	presence: (room: RoomKey, presence: Presence) => Promise<void>;
	/** Closes a user's streams on a topic. Never throws, like `publish`. */
	evict: (room: RoomKey, eviction: Eviction) => Promise<void>;
};

/**
 * Headers that stop anything in the path from buffering the stream.
 *
 * `X-Accel-Buffering` is nginx-specific and harmless elsewhere; without it a
 * proxy can hold events until its buffer fills, which turns a live feed into a
 * batch delivered minutes late. `no-transform` stops a compressing proxy doing
 * the same thing.
 */
export const SSE_HEADERS: Record<string, string> = {
	'content-type': 'text/event-stream',
	'cache-control': 'no-cache, no-transform',
	connection: 'keep-alive',
	'x-accel-buffering': 'no'
};

/**
 * One SSE frame, named by its topic.
 *
 * A named event rather than a bare `data:` line, so a page with several
 * topics open can tell them apart with `addEventListener(topic)` without the
 * room having to wrap or parse the publisher's data.
 */
export function encodeSseFrame(topic: string, data: string): string {
	return `event: ${topic}\ndata: ${data}\n\n`;
}

/**
 * A comment frame, sent as soon as a stream opens.
 *
 * Not optional. `EventSource` does not fire `onopen` until it has received
 * something, and neither do most proxies flush headers alone, so without this
 * a client cannot tell "connected, nothing happening yet" from "still
 * connecting", and its reconnect backoff never resets.
 */
export const SSE_PREAMBLE = ': connected\n\n';

/** Keeps an idle stream from being reaped by an intermediary. */
export const SSE_KEEPALIVE = ': ping\n\n';

/**
 * Small frames one client may have queued before it is disconnected.
 *
 * A client that has stopped reading is asleep, offline, or behind a proxy that
 * buffers `text/event-stream`. Hanging up on it is safe because reconnecting
 * refetches unconditionally (see `src/lib/realtime/live.ts`), so the
 * alternative, an unbounded queue per stalled client inside a 128 MB Durable
 * Object, buys nothing.
 */
export const SSE_QUEUE_LIMIT = 16;

/**
 * Bytes one client may have queued before it is disconnected.
 *
 * Message frames are a few dozen bytes, so `SSE_QUEUE_LIMIT` is what binds
 * them. A notebook frame carries an edit and can be tens of kilobytes, so a
 * count alone would let sixteen of them hold megabytes per stalled client.
 * `queuedSize` charges each frame at least an equal share of this, so both
 * limits hold at once.
 */
export const SSE_QUEUE_BYTES = 1024 * 1024;

/**
 * What a frame counts against `SSE_QUEUE_BYTES`.
 *
 * Small frames are rounded up to a sixteenth of the budget, which is what
 * makes the frame limit fall out of the byte limit for free.
 */
export function queuedSize(chunk: Uint8Array): number {
	return Math.max(chunk.byteLength, SSE_QUEUE_BYTES / SSE_QUEUE_LIMIT);
}

/**
 * How often to send one.
 *
 * 25 seconds because the common proxy idle timeout is 30 and Cloudflare's is
 * 100. Cheap: a Durable Object is billed on wall-clock while it holds a
 * request, and it is holding one regardless of whether it writes.
 */
export const SSE_KEEPALIVE_MS = 25_000;

/**
 * How long a stream counts as open without hearing from its page.
 *
 * **A browser hanging up does not reach the room.** On Workers neither the
 * request's abort signal nor a failing write tells the Durable Object that a
 * client went away. Measured on the preview, a phone that had left the board
 * was still listed as watching minutes later, so every push to it was
 * skipped. So a stream is a lease rather than a connection: the page renews it
 * every `PRESENCE_INTERVAL_MS` (in `live.ts`) while it is on screen, says when
 * it leaves, and a stream not heard from within this long is closed and no
 * longer reported as watching.
 *
 * A little over two intervals, so one late or lost renewal does not cost a
 * live page its stream. This is also the longest a message can go unpushed
 * to a device that vanished without saying so (a phone locked before its
 * goodbye got out, say). See docs/notifications.md.
 */
export const PRESENCE_TTL_MS = 60_000;

/** Whether a stream last heard from at `lastSeen` has outlived its lease. */
export function isExpired(lastSeen: number, now: number): boolean {
	return now - lastSeen > PRESENCE_TTL_MS;
}
