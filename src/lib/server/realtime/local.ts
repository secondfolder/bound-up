import {
	encodeSseFrame,
	isExpired,
	type Notifier,
	type RoomKey,
	SSE_HEADERS,
	SSE_KEEPALIVE,
	SSE_KEEPALIVE_MS,
	SSE_PREAMBLE,
	type Watcher
} from './index';

/**
 * The development notifier: one `Map`, in one process.
 *
 * Correct rather than a stub, which is the point — `npm run dev` and the
 * Playwright suite exercise the same client code, the same endpoint and the
 * same SSE framing as production, and only the fan-out differs. Kept
 * module-level because `vite dev` and the self-hosted server are each a
 * single Node process, so every request genuinely shares this table. That is
 * also why a self-hosted instance supports one replica only: a second process
 * would have a table of its own and never hear the first one's publishes.
 *
 * `backend.ts` reaches this only behind `if (dev || __SELF_HOSTED__)`, both
 * build-time constants, so the whole file is dead-code-eliminated from the
 * worker bundle.
 */

const encoder = new TextEncoder();

/** One open stream: whose it is, when its page last spoke, and how to end it. */
type Entry = { watcher: Watcher; topics: Set<string>; lastSeen: number; close: () => void };

/** Room key → the open streams watching it. */
const rooms = new Map<RoomKey, Map<ReadableStreamDefaultController<Uint8Array>, Entry>>();

/**
 * Ends every stream in a room whose lease has run out — see `PRESENCE_TTL_MS`.
 *
 * Node does tell a stream when its client goes (`cancel` below), unlike
 * Workers, but the lease applies here too so that both backends behave the
 * same, and so the Playwright suite exercises the rule production relies on.
 */
function closeExpired(key: RoomKey): void {
	const now = Date.now();
	for (const entry of [...(rooms.get(key)?.values() ?? [])]) {
		if (isExpired(entry.lastSeen, now)) {
			entry.close();
		}
	}
}

export function createLocalNotifier(): Notifier {
	return {
		publish(key, topic, data) {
			closeExpired(key);
			const room = rooms.get(key);
			if (!room) {
				return Promise.resolve([]);
			}

			const frame = encoder.encode(encodeSseFrame(topic, data));
			// A copy, because a failed enqueue removes the controller from the set
			// we would otherwise be iterating.
			for (const [controller, entry] of [...room]) {
				if (!entry.topics.has(topic)) {
					continue;
				}
				try {
					controller.enqueue(frame);
				} catch {
					// The client has gone. Nothing to report — a closed stream is the
					// normal end of every subscription, not an error.
					entry.close();
				}
			}
			return Promise.resolve(
				[...room.values()].filter((entry) => entry.topics.has(topic)).map((entry) => entry.watcher)
			);
		},

		stream(key, { watcher, topics }) {
			let own: ReadableStreamDefaultController<Uint8Array> | undefined;
			let keepalive: ReturnType<typeof setInterval> | undefined;

			const drop = () => {
				if (keepalive) {
					clearInterval(keepalive);
				}
				const room = rooms.get(key);
				if (!(room && own)) {
					return;
				}
				room.delete(own);
				if (room.size === 0) {
					rooms.delete(key);
				}
			};

			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					own = controller;
					const room = rooms.get(key) ?? new Map();
					rooms.set(key, room);
					room.set(controller, {
						watcher,
						topics: new Set(topics),
						lastSeen: Date.now(),
						close: () => {
							drop();
							try {
								controller.close();
							} catch {
								// Already closed or errored: the client went first.
							}
						}
					});

					controller.enqueue(encoder.encode(SSE_PREAMBLE));
					keepalive = setInterval(() => {
						const entry = rooms.get(key)?.get(controller);
						if (entry && isExpired(entry.lastSeen, Date.now())) {
							entry.close();
							return;
						}
						try {
							controller.enqueue(encoder.encode(SSE_KEEPALIVE));
						} catch {
							drop();
						}
					}, SSE_KEEPALIVE_MS);
				},
				// Fired when the client hangs up, which is what the visibility gate on
				// the browser side does deliberately and often.
				cancel: drop
			});

			return Promise.resolve(new Response(body, { headers: SSE_HEADERS }));
		},

		presence(key, { userId, streamId, present }) {
			// Matched on the user as well as the stream: the user comes from the
			// session, so naming somebody else's stream does nothing.
			for (const entry of [...(rooms.get(key)?.values() ?? [])]) {
				if (entry.watcher.userId !== userId || entry.watcher.streamId !== streamId) {
					continue;
				}
				if (present) {
					entry.lastSeen = Date.now();
				} else {
					entry.close();
				}
			}
			return Promise.resolve();
		},

		evict(key, { userId, topic }) {
			for (const entry of [...(rooms.get(key)?.values() ?? [])]) {
				if (entry.watcher.userId === userId && entry.topics.has(topic)) {
					entry.close();
				}
			}
			return Promise.resolve();
		}
	};
}

/** Exported for the tests, which need to observe fan-out without HTTP. */
export function localRoomSize(key: RoomKey): number {
	return rooms.get(key)?.size ?? 0;
}

export type { Watcher } from './index';
