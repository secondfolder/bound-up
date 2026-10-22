/**
 * Watching a partnership's messages for changes, from the browser.
 *
 * BROWSER ONLY. A thin wrapper over `watchRoom` (`$lib/realtime/live`), which
 * holds the visibility gate, the reconnection rules and the presence lease;
 * read the note there before changing how a stream opens or closes. This
 * file is only what messaging adds: the `messages` topic, and parsing its
 * frames, which are metadata only, on purpose (see `MessagingEvent` in
 * `server/realtime/messaging.ts`). The caller's whole reaction is a refetch.
 */

import { partnershipRoom, watchRoom } from '$lib/realtime/live';

/** Matches the server's `MessagingEvent`. Metadata only, by design. */
export type LiveEvent = {
	kind: 'thread' | 'message' | 'reaction' | 'tags' | 'restore' | 'read';
	threadId?: string;
};

/** The topic messaging publishes on; `MESSAGES_TOPIC` on the server. */
export const MESSAGES_TOPIC = 'messages';

export type LiveOptions = {
	partnershipId: string;
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
export function watchPartnership(options: LiveOptions): () => void {
	const { partnershipId, onChange } = options;
	return watchRoom({
		room: partnershipRoom(partnershipId),
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
