import { type Notifier, partnershipRoom, type Watcher } from './index';

/**
 * The `messages` topic: partner messaging's live feed.
 *
 * **Metadata only, and that is a rule rather than a convention.** The room
 * relays whatever string it is given (notebook frames carry ciphertext), so
 * the rule for messaging lives here, in the one helper every messaging
 * publisher goes through, and in `MessagingEvent`, which has nowhere to put a
 * body. A message event says *that* a partnership changed and, where it helps,
 * which thread, never who sent it and never a byte of content; the client's
 * whole reaction is `invalidate()`. A future event wanting to carry a body is
 * a reason to stop and reconsider, not a small extension. See
 * docs/messaging.md#realtime.
 */
export const MESSAGES_TOPIC = 'messages';

/**
 * What a change notification says.
 *
 * `kind` exists so a client can be told apart a board change from a thread
 * change and invalidate the narrower key; `threadId` is absent for anything
 * board-level. Both are unguessable-by-design UUIDs already known to whoever
 * is allowed to receive them.
 *
 * `thread` and `message` mean a message was written (a new thread, a reply)
 * and nothing else does: a tag change is `tags`. A thread page relies on
 * that to decide whether another thread is worth a toast, so a kind that is
 * not a new message must not borrow either of them.
 *
 * `read` means a member's read mark in a thread moved, so the other one's read
 * receipt may have. Only a thread page shows receipts, so the board ignores it.
 */
export type MessagingEvent = {
	kind: 'thread' | 'message' | 'reaction' | 'tags' | 'restore' | 'read';
	/** Absent when the change is board-level rather than inside one thread. */
	threadId?: string;
};

/**
 * Announces a messaging change, and returns who was watching the board.
 *
 * Only `messages` watchers are returned, so a device that merely has a
 * notebook page of the same partnership open still gets its push.
 */
export function publishMessagingEvent(
	notifier: Notifier,
	partnershipId: string,
	event: MessagingEvent
): Promise<Watcher[]> {
	// Rebuilt field by field rather than passed through, so nothing a caller
	// happens to attach to the object can ride along.
	const frame: MessagingEvent = event.threadId
		? { kind: event.kind, threadId: event.threadId }
		: { kind: event.kind };
	return notifier.publish(partnershipRoom(partnershipId), MESSAGES_TOPIC, JSON.stringify(frame));
}
