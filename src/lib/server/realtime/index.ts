/**
 * Telling the other device that something changed.
 *
 * An interface with two implementations, for the same reason
 * `src/lib/server/db/backend.ts` and `server/media/index.ts` have one each:
 * `svelte.config.js` strips the Cloudflare adapter's `emulate` hook, so
 * `vite dev` has no `event.platform` and therefore no Durable Object binding at
 * all. Production gets a Durable Object; dev gets a module-level `Map`, which
 * is genuinely correct there because dev is one Node process.
 *
 * **Events carry metadata only, and that is a rule rather than a convention.**
 * An event says *that* a partnership changed and, where it helps, which thread
 * — never who sent it and never a byte of content. The client's entire reaction
 * is to call `invalidate()` and re-run the load it already has. So the Durable
 * Object never handles message content, holds no storage, and knows nothing but
 * a partnership id. If a future event ever wants to carry a body, that is the
 * moment to stop and reconsider, not a small extension.
 *
 * The one thing a room does know about its listeners is *who* they are — a
 * user id, and the push device they are on if they have one — and only so that
 * `publish` can say who is watching. A device with the board open is already
 * being told; sending it a push notification as well would be noise. See
 * docs/notifications.md.
 *
 * **SSE, not WebSocket**, and the reason is decisive rather than aesthetic:
 * `vite dev` cannot serve a WebSocket upgrade from a `+server.ts` at all, so a
 * socket would need a second client code path used only in development — and
 * the Playwright suite would then never exercise the real one. An SSE stream is
 * a plain streaming `Response` and behaves identically in dev and on Workers.
 */

/**
 * What a change notification says.
 *
 * `kind` exists so a client can be told apart a board change from a thread
 * change and invalidate the narrower key; `threadId` is absent for anything
 * board-level. Both are unguessable-by-design UUIDs already known to whoever
 * is allowed to receive them.
 */
export type RealtimeEvent = {
	kind: 'thread' | 'message' | 'reaction' | 'restore';
	/** Absent when the change is board-level rather than inside one thread. */
	threadId?: string;
};

/**
 * One open stream's listener.
 *
 * `userId` is set by the events endpoint from the session, never from the
 * request, so a member cannot claim to be the other one. `deviceId` is the
 * listener's own push subscription id, if it has one, as the browser reports
 * it; at worst a wrong one means a push that should have been skipped is sent.
 */
export type Watcher = {
	userId: string;
	deviceId: string | null;
};

export type Notifier = {
	/**
	 * Announces a change to everyone currently watching a partnership, and
	 * returns who that was.
	 *
	 * Must never throw. A realtime failure has to be invisible: the write it
	 * follows has already committed, and turning that into a 500 would make the
	 * client retry a send that actually succeeded. A failure reports nobody
	 * watching, which errs towards sending a push rather than losing one.
	 */
	publish: (partnershipId: string, event: RealtimeEvent) => Promise<Watcher[]>;
	/** A long-lived SSE `Response` for one partnership. */
	stream: (partnershipId: string, watcher: Watcher) => Promise<Response>;
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

/** One SSE frame. */
export function encodeSseEvent(event: RealtimeEvent): string {
	return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * A comment frame, sent as soon as a stream opens.
 *
 * Not optional. `EventSource` does not fire `onopen` until it has received
 * something, and neither do most proxies flush headers alone — so without this
 * a client cannot tell "connected, nothing happening yet" from "still
 * connecting", and its reconnect backoff never resets.
 */
export const SSE_PREAMBLE = ': connected\n\n';

/** Keeps an idle stream from being reaped by an intermediary. */
export const SSE_KEEPALIVE = ': ping\n\n';

/**
 * Frames one client may have queued before it is disconnected.
 *
 * A client that has stopped reading is asleep, offline, or behind a proxy that
 * buffers `text/event-stream`. Hanging up on it is safe because reconnecting
 * refetches unconditionally (see `live.ts`), so the alternative — an unbounded
 * queue per stalled client inside a 128 MB Durable Object — buys nothing.
 */
export const SSE_QUEUE_LIMIT = 16;

/**
 * How often to send one.
 *
 * 25 seconds because the common proxy idle timeout is 30 and Cloudflare's is
 * 100. Cheap: a Durable Object is billed on wall-clock while it holds a
 * request, and it is holding one regardless of whether it writes.
 */
export const SSE_KEEPALIVE_MS = 25_000;
