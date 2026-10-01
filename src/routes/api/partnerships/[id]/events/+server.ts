import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireMembership } from '$lib/server/messaging';
import { createNotifier } from '$lib/server/realtime/backend';
import type { RequestHandler } from './$types';

const deviceIdSchema = z.string().uuid();

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
	const notifier = await createNotifier({ platform });
	return notifier.stream(params.id, {
		userId: locals.user.id,
		deviceId: deviceIdSchema.safeParse(device).success ? device : null
	});
};
