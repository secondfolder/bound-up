import type { Db } from '../db';
import { spaceMemberIds } from '../spaces';
import { type Notifier, publishFanOut, type Watcher } from './index';

/**
 * Publishes a space's list-level event to the space's room and to each of its
 * members' own rooms (`fanOutRooms` in `./index.ts`), reading the members
 * first. See docs/realtime.md, "Everyone".
 *
 * Never throws, like `publish`: the write this follows has already
 * committed. If the members cannot be read, the event still reaches the
 * space's own room, and an Everyone page catches up when it is next looked
 * at (it resyncs on becoming visible).
 *
 * Not alias-free, unlike `./index.ts`: it reads the database, and the Durable
 * Object never imports it.
 */
export async function publishToSpace(
	notifier: Notifier,
	db: Db,
	spaceId: string,
	topic: string,
	data: string
): Promise<Watcher[]> {
	let members: string[] = [];
	try {
		members = await spaceMemberIds(db, spaceId);
	} catch (error) {
		console.error('could not read a space’s members to fan an event out', error);
	}
	return await publishFanOut(notifier, spaceId, members, topic, data);
}
