import { entryTopic, NOTEBOOK_LIST_TOPIC, type NotebookFrame } from '../notebook';
import type { Notifier, RoomKey } from './realtime/index';

/**
 * The notebook's two realtime topics, in the room the entry's scope has.
 *
 * An entry's topic carries its edits and cursors live, as sealed records
 * the server cannot open, because co-editing cannot wait for a refetch per
 * keystroke. Everything else on it, and everything on the list topic, is
 * metadata only, like messaging: it says that something happened, and the
 * page refetches through its normal, authorised path. See docs/notebook.md.
 */

export function publishEntryFrame(
	notifier: Notifier,
	room: RoomKey,
	entryId: string,
	frame: NotebookFrame
): Promise<unknown> {
	return notifier.publish(room, entryTopic(entryId), JSON.stringify(frame));
}

/** Tells any open list that an entry came, went, or changed who can see it. */
export function publishListChange(notifier: Notifier, room: RoomKey): Promise<unknown> {
	return notifier.publish(room, NOTEBOOK_LIST_TOPIC, JSON.stringify({ kind: 'changed' }));
}
