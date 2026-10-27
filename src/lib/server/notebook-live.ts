import { entryTopic, NOTEBOOK_LIST_TOPIC, type NotebookFrame } from '../notebook';
import type { Db } from './db';
import { publishToSpace } from './realtime/fan-out';
import type { Notifier, RoomKey } from './realtime/index';

/**
 * The notebook's two realtime topics: an entry's, in its space's room, and
 * the list's, in its space's room and each member's own.
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

/**
 * Tells any open list that an entry in `spaceId` came, went, or changed who
 * can see it: a list of that space in the space's room, and an Everyone list
 * in each member's own room (docs/realtime.md, "Everyone").
 */
export function publishListChange(notifier: Notifier, db: Db, spaceId: string): Promise<unknown> {
	return publishToSpace(
		notifier,
		db,
		spaceId,
		NOTEBOOK_LIST_TOPIC,
		JSON.stringify({ kind: 'changed' })
	);
}
