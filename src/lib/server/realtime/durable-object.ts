import {
	encodeSseEvent,
	isExpired,
	type Presence,
	type RealtimeEvent,
	SSE_HEADERS,
	SSE_KEEPALIVE,
	SSE_KEEPALIVE_MS,
	SSE_PREAMBLE,
	SSE_QUEUE_LIMIT,
	type Watcher
} from './index';

/**
 * One room per partnership, holding only the open connections watching it.
 *
 * **This file is a second alias-free zone.** It is bundled by wrangler's esbuild
 * rather than by vite — the `sveltekit-cloudflare-do` plugin appends
 * `export { RealtimeRoom }` to the worker the adapter generates, and esbuild
 * resolves neither `$lib` nor any of SvelteKit's aliases from there — so every
 * import here is relative, and `./index` is the only one.
 *
 * Written in the classic `(state, env)` + `fetch` style rather than by
 * extending `DurableObject` from `cloudflare:workers`, and that is deliberate:
 * that base class has no types without `@cloudflare/workers-types`, a package
 * AGENTS.md forbids because it publishes its types as ambient globals and would
 * overwrite the DOM's `Request`/`Response`/`fetch` for the whole project,
 * including the component test project. The classic style needs no types at all.
 *
 * The object holds **no storage** and never sees message content — see the note
 * on `RealtimeEvent`. Everything it knows is which sockets are open and whose
 * they are, which is why it can be discarded and recreated at any time with no
 * consequence beyond clients reconnecting.
 */

const encoder = new TextEncoder();

export class RealtimeRoom {
	/**
	 * The open streams, whose they are, and when their page was last heard from.
	 *
	 * Writers rather than controllers because a `TransformStream`'s writer is
	 * what Workers gives back for a streaming `Response`. A failed `write` would
	 * be how a hung-up client announces itself, if the runtime ever told us —
	 * in practice it does not, which is what `lastSeen` is for. See
	 * `PRESENCE_TTL_MS`.
	 */
	readonly #writers = new Map<
		WritableStreamDefaultWriter<Uint8Array>,
		{ watcher: Watcher; lastSeen: number }
	>();

	// No constructor. The runtime passes `(state, env)`, and this object
	// deliberately keeps neither: it has no storage and no bindings of its own,
	// so reading either would be a mistake.

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/publish') {
			const event = (await request.json()) as RealtimeEvent;
			// Expired leases go first, so a page that left without saying so is
			// neither sent this nor reported as watching.
			this.#dropExpired();
			this.#broadcast(event);
			// Who is watching *after* the broadcast, so a client it just dropped for
			// not reading is not counted as having been told.
			return Response.json({
				watching: [...this.#writers.values()].map((entry) => entry.watcher)
			});
		}

		if (url.pathname === '/subscribe') {
			return this.#subscribe(request);
		}

		if (url.pathname === '/presence') {
			this.#presence((await request.json()) as Presence);
			return new Response(null, { status: 204 });
		}

		// Unreachable through the app — `remote.ts` is the only caller and it only
		// ever asks for these three paths. A 404 rather than a throw so a mistake
		// shows up as a bad response instead of an exception in the logs.
		return new Response('Not found', { status: 404 });
	}

	/**
	 * Fans an event out, without ever waiting for a reader.
	 *
	 * The writes are deliberately **not** awaited, and that is the whole point
	 * of this method's shape. A `TransformStream` writer's `write()` resolves
	 * only once the chunk has been *read*, so awaiting it means awaiting the
	 * slowest client on the other side of the internet — which would block the
	 * broadcast, and with it the `/publish` request that the sender's own HTTP
	 * request is sitting on. One stalled reader would stall sending for the
	 * whole partnership. (A test that awaited two writes before reading either
	 * deadlocked outright, which is how this was found.)
	 *
	 * Ordering per client is still guaranteed: writes queue on the writable in
	 * call order whether or not anyone awaits them.
	 */
	#broadcast(event: RealtimeEvent): void {
		const frame = encoder.encode(encodeSseEvent(event));
		// Copied first: `#drop` mutates the set we would otherwise be iterating.
		for (const writer of [...this.#writers.keys()]) {
			// A full queue means this client has stopped reading — asleep, offline,
			// or behind a proxy that buffers. Disconnect it rather than growing a
			// queue for it: it will reconnect when it can, and reconnecting
			// refetches unconditionally (see `live.ts`), so nothing is lost by
			// hanging up on it. Without this, a client that never reads is an
			// unbounded queue inside a 128 MB object.
			//
			// `null` is an errored stream: the client has hung up and its write
			// would only fail. Dropped now rather than when that rejection lands,
			// so the watcher list `/publish` returns does not count it as told.
			if (writer.desiredSize === null || writer.desiredSize <= 0) {
				this.#drop(writer);
				continue;
			}
			// A closed stream is the normal end of every subscription, so a rejected
			// write is bookkeeping rather than an error worth logging.
			void writer.write(frame).catch(() => this.#drop(writer));
		}
	}

	#subscribe(request: Request): Response {
		// A queue deeper than the default 1, so `desiredSize` in `#broadcast` means
		// "this client has genuinely stopped reading" rather than "has not read
		// the frame sent a moment ago". Frames are a few dozen bytes, so the
		// memory this permits is negligible next to the cost of being wrong.
		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>(
			{},
			{ highWaterMark: SSE_QUEUE_LIMIT }
		);
		const writer = writable.getWriter();
		const url = new URL(request.url);
		this.#writers.set(writer, {
			watcher: {
				// Always present: `remote.ts` is the only caller, it takes the user
				// from the session, and the events endpoint refuses a stream without
				// an id.
				userId: url.searchParams.get('user') ?? '',
				deviceId: url.searchParams.get('device'),
				streamId: url.searchParams.get('stream') ?? ''
			},
			// Opening is the first sign of life; the page renews it from there.
			lastSeen: Date.now()
		});

		// Meant to fire when the client hangs up, but on Workers it was not seen
		// to: a stream the page had closed stayed listed for minutes. Kept because
		// it costs nothing where it does fire; the page's own goodbye and the
		// lease are what actually end a stream. See `PRESENCE_TTL_MS`.
		request.signal?.addEventListener('abort', () => this.#drop(writer));

		// Not awaited: `fetch` has to return the Response now, and the preamble is
		// the first thing down the pipe either way.
		void (async () => {
			try {
				await writer.write(encoder.encode(SSE_PREAMBLE));
				while (this.#writers.has(writer)) {
					await sleep(SSE_KEEPALIVE_MS);
					const entry = this.#writers.get(writer);
					if (!entry) {
						break;
					}
					// Also what ends a stream nobody is reading any more, rather than
					// leaving the room billed for holding it open indefinitely.
					if (isExpired(entry.lastSeen, Date.now())) {
						this.#drop(writer);
						break;
					}
					await writer.write(encoder.encode(SSE_KEEPALIVE));
				}
			} catch {
				this.#drop(writer);
			}
		})();

		return new Response(readable, { headers: SSE_HEADERS });
	}

	/**
	 * Renews a stream's lease, or closes it when its page says it has gone.
	 *
	 * Matched on the user as well as the stream id: the user comes from the
	 * session, so naming somebody else's stream does nothing.
	 */
	#presence({ userId, streamId, present }: Presence): void {
		for (const [writer, entry] of [...this.#writers]) {
			if (entry.watcher.userId !== userId || entry.watcher.streamId !== streamId) {
				continue;
			}
			if (present) {
				entry.lastSeen = Date.now();
			} else {
				this.#drop(writer);
			}
		}
	}

	#dropExpired(): void {
		const now = Date.now();
		for (const [writer, entry] of [...this.#writers]) {
			if (isExpired(entry.lastSeen, now)) {
				this.#drop(writer);
			}
		}
	}

	#drop(writer: WritableStreamDefaultWriter<Uint8Array>): void {
		this.#writers.delete(writer);
		// The close can itself throw if the stream is already gone, which is
		// exactly the case that got us here.
		void writer.close().catch(() => {
			// Already closed or errored — nothing left to tidy.
		});
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
