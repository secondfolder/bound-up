import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { createNotifier } from '$lib/server/realtime/backend';
import { isTopic, MAX_TOPICS_PER_STREAM, parseRoomKey } from '$lib/server/realtime/index';
import { mayWatch } from '$lib/server/realtime/topics';
import type { RequestHandler } from './$types';

const idSchema = z.string().uuid();

/**
 * A live feed: one room, some topics. Every realtime feature's stream.
 *
 * Outside both route groups on purpose (see AGENTS.md). A group guard is a
 * layout load and layout loads never run for a `+server.ts`, so the checks
 * are here explicitly: the room and every topic are authorised by `mayWatch`
 * before the stream opens, and a stream's topics never change after that.
 *
 * What travels down the stream is the publishing feature's business; see
 * `server/realtime/index.ts`. Messages are metadata only; notebook entries
 * are sealed ciphertext the server cannot read.
 *
 * No `Content-Length` and no compression: it is an open-ended stream, and a
 * compressing intermediary would buffer it; see `SSE_HEADERS`.
 */
export const GET: RequestHandler = async ({ locals, platform, url }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const room = parseRoomKey(url.searchParams.get('room'));
	const topics = [...new Set(url.searchParams.getAll('topic'))];
	if (!room || topics.length === 0 || topics.length > MAX_TOPICS_PER_STREAM) {
		error(400, 'A live feed needs a `room` and between one and eight `topic`s');
	}
	if (!topics.every(isTopic)) {
		error(400, 'A `topic` is a feature name, optionally followed by `:` and an id');
	}

	// Which stream this is, so the page can renew its lease and say goodbye to
	// exactly this one; see `presence/+server.ts`. Required: a stream with no id
	// could never be renewed, and would be closed when its lease ran out.
	const streamId = url.searchParams.get('stream');
	if (!(streamId && idSchema.safeParse(streamId).success)) {
		error(400, 'A live feed needs a `stream` id: reload the page to get one');
	}

	// The same 404-not-403 as every other partner route: distinguishing them
	// would confirm the id is real. Covers a hidden notebook entry too.
	if (!(await mayWatch(locals.db, locals.user.id, room, topics))) {
		error(404, 'Not found');
	}

	// Which push device this is, so a message arriving while it watches is not
	// also pushed to it. The user comes from the session and never from the
	// query, so a member cannot pass themselves off as the other one; the device
	// id is only ever compared against that user's own subscriptions.
	const device = url.searchParams.get('device');
	const deviceId = idSchema.safeParse(device).success ? device : null;

	const notifier = await createNotifier({ platform });
	return notifier.stream(room, {
		watcher: { userId: locals.user.id, deviceId, streamId },
		topics
	});
};
