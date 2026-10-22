import { NOTEBOOK_LIST_TOPIC } from '../../notebook';
import type { Db } from '../db';
import { requireMembership } from '../messaging';
import { getEntryContext } from '../notebook';
import { type RoomKey, roomScope } from './index';
import { MESSAGES_TOPIC } from './messaging';

/**
 * Who may listen to what.
 *
 * The room fans out whatever it is told to, to whoever subscribed, so this is
 * the whole of realtime's access control: the events endpoint calls it before
 * opening a stream, for the room and then for every topic the page names,
 * and refuses the lot if any one fails. A topic cannot be added to an open
 * stream, so nothing reaches a stream that was not checked here.
 *
 * Not alias-free, unlike the rest of this directory: the Durable Object never
 * imports it. Only the endpoints do.
 */

const ENTRY_TOPIC = /^notebook-entry:(?<entryId>[0-9a-f-]{36})$/;

/** Whether `userId` may open a stream on `room` at all. */
async function mayEnterRoom(db: Db, userId: string, room: RoomKey): Promise<boolean> {
	const { kind, id } = roomScope(room);
	if (kind === 'user') {
		return id === userId;
	}
	return (await requireMembership(db, id, userId)) !== null;
}

/** Whether `userId`, already allowed in `room`, may hear `topic` there. */
async function mayHear(db: Db, userId: string, room: RoomKey, topic: string): Promise<boolean> {
	const { kind, id } = roomScope(room);
	if (topic === MESSAGES_TOPIC) {
		// Messaging only exists between partners.
		return kind === 'partnership';
	}
	if (topic === NOTEBOOK_LIST_TOPIC) {
		return true;
	}
	const match: RegExpExecArray | null = ENTRY_TOPIC.exec(topic);
	const entryId = match?.groups?.entryId;
	if (entryId) {
		// The entry must be in this room's scope, and readable by this viewer: an
		// entry hidden from them is refused like one that does not exist.
		const context = await getEntryContext(
			db,
			entryId,
			userId,
			kind === 'user' ? { kind: 'self' } : { kind: 'partnership', partnershipId: id }
		);
		return context !== null && context.room === room;
	}
	return false;
}

/**
 * Whether `userId` may open a stream on `room` for every one of `topics`.
 *
 * Callers answer `false` with a 404, the same as for a room that does not
 * exist, so a refusal never confirms that an id is real.
 */
export async function mayWatch(
	db: Db,
	userId: string,
	room: RoomKey,
	topics: readonly string[]
): Promise<boolean> {
	if (!(await mayEnterRoom(db, userId, room))) {
		return false;
	}
	for (const topic of topics) {
		if (!(await mayHear(db, userId, room, topic))) {
			return false;
		}
	}
	return true;
}

/** Whether `userId` may renew or end their own streams in `room`. */
export function mayUseRoom(db: Db, userId: string, room: RoomKey): Promise<boolean> {
	return mayEnterRoom(db, userId, room);
}
