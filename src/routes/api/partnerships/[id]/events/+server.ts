import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireMembership } from '$lib/server/messaging';
import { createNotifier } from '$lib/server/realtime/backend';
import type { RequestHandler } from './$types';

const idSchema = z.string().uuid();

/**
 * The live feed for one partnership.
 *
 * Outside both route groups on purpose — see AGENTS.md. A group guard is a
 * layout load and layout loads never run for a `+server.ts`, so the membership
 * check is here explicitly.
 *
 * What travels down this stream is metadata only: `{ kind, threadId }` and
 * nothing else. The client's whole reaction is to `invalidate()` the load it
 * already has, which then re-reads through the same authorised path as a normal
 * navigation. So this endpoint hands out no content and cannot be turned into
 * one that does without changing `RealtimeEvent`.
 *
 * No `Content-Length` and no compression: it is an open-ended stream, and a
 * compressing intermediary would buffer it — see `SSE_HEADERS`.
 */
export const GET: RequestHandler = async ({ locals, params, platform, url }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	// The same 404-not-403 as every other partner route: distinguishing them
	// would confirm the id is real.
	const membership = await requireMembership(locals.db, params.id, locals.user.id);
	if (!membership) {
		error(404, 'Partner not found');
	}

	// Which push device this is, so a message arriving while it watches is not
	// also pushed to it. The user comes from the session and never from the
	// query, so a member cannot pass themselves off as the other one; the device
	// id is only ever compared against that user's own subscriptions.
	const device = url.searchParams.get('device');
	const deviceId = idSchema.safeParse(device).success ? device : null;

	// Which stream this is, so the page can renew its lease and say goodbye to
	// exactly this one — see `presence/+server.ts`. Required: a stream with no id
	// could never be renewed, and would be closed when its lease ran out.
	const streamId = url.searchParams.get('stream');
	if (!(streamId && idSchema.safeParse(streamId).success)) {
		error(400, 'A live feed needs a `stream` id: reload the page to get one');
	}
	// TEMPORARY, while iPhone delivery is diagnosed: whether this stream will
	// count as a device watching. Cloudflare's logs redact the query string, so
	// the request line cannot say. See docs/temporary-code.md.
	console.info(
		`live feed opened: device ${deviceId?.slice(0, 8) ?? (device === null ? 'none' : 'invalid')}`
	);
	const notifier = await createNotifier({ platform });
	return notifier.stream(params.id, { userId: locals.user.id, deviceId, streamId });
};
