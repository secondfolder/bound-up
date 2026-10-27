/**
 * Watching messages for changes, from the browser: one partnership's, in its
 * space's room, or every partnership's at once, in the viewer's own room.
 *
 * BROWSER ONLY. A thin wrapper over `watchRoom` (`$lib/realtime/live`), which
 * holds the visibility gate, the reconnection rules and the presence lease;
 * read the note there before changing how a stream opens or closes. This
 * file is only what messaging adds: the `messages` topic, and parsing its
 * frames, which are metadata only, on purpose (see `MessagingEvent` in
 * `server/realtime/messaging.ts`). The caller's whole reaction is a refetch.
 */

import { type RoomKey, watchRoom } from '$lib/realtime/live';

/** Matches the server's `MessagingFrame`. Metadata only, by design. */
export type LiveEvent = {
	kind: 'thread' | 'message' | 'reaction' | 'tags' | 'restore' | 'read';
	threadId?: string;
	/** The partnership's space the change is in: which board an Everyone page reloads. */
	spaceId?: string;
};

/** The topic messaging publishes on; `MESSAGES_TOPIC` on the server. */
export const MESSAGES_TOPIC = 'messages';

export type LiveOptions = {
	/**
	 * `spaceRoom(partnershipId)` for one partnership's board or a thread, or
	 * `userRoom(viewerId)` for an Everyone board, which every partnership
	 * fans its events out to. A `read` event is never fanned out, so an
	 * Everyone board does not hear one.
	 */
	room: RoomKey;
	/**
	 * Called for every change, and with null whenever something may have been
	 * missed (becoming visible, a reconnect, a poll).
	 *
	 * Idempotent by requirement: it is called speculatively, so it must be safe
	 * to run when nothing has actually changed. `invalidate()` is.
	 */
	onChange: (event: LiveEvent | null) => void;
};

/** Starts watching. Returns the teardown, for an `$effect`'s cleanup. */
export function watchMessages(options: LiveOptions): () => void {
	const { room, onChange } = options;
	return watchRoom({
		room,
		topics: [MESSAGES_TOPIC],
		onFrame: (_topic, data) => {
			try {
				onChange(JSON.parse(data) as LiveEvent);
			} catch {
				// A frame we cannot parse still means *something* changed, and the
				// callback is a refetch either way.
				onChange(null);
			}
		},
		onResync: () => onChange(null)
	});
}
