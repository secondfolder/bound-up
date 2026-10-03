import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireMembership } from '$lib/server/messaging';
import { createNotifier } from '$lib/server/realtime/backend';
import type { RequestHandler } from './$types';

const presenceSchema = z.object({
	stream: z.string().uuid(),
	present: z.boolean()
});

/**
 * A page saying its live feed is still on screen, or that it has gone.
 *
 * The room cannot tell for itself: on Workers a browser hanging up never
 * reaches it, so each stream is a lease the page renews — see
 * `PRESENCE_TTL_MS` and docs/notifications.md. What rides on it is push: a
 * stream that is still listed counts as its device watching, and a watching
 * device is not sent a notification.
 *
 * Read as text and parsed here, because `navigator.sendBeacon` posts a string
 * as `text/plain` and cannot set a content type of its own. A beacon is used
 * because the goodbye is sent as the page goes away, which a `fetch` might
 * not survive.
 *
 * Membership is checked even though the room only ever matches the session's
 * own streams: without it any signed-in account could make a Durable Object
 * exist for an arbitrary id.
 */
export const POST: RequestHandler = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	let body: unknown;
	try {
		body = JSON.parse(await request.text());
	} catch {
		error(400, 'Expected a JSON body');
	}
	const parsed = presenceSchema.safeParse(body);
	if (!parsed.success) {
		error(400, 'Expected `{ stream, present }`');
	}

	// The same 404-not-403 as every other partner route.
	const membership = await requireMembership(locals.db, params.id, locals.user.id);
	if (!membership) {
		error(404, 'Partner not found');
	}

	const notifier = await createNotifier({ platform });
	await notifier.presence(params.id, {
		userId: locals.user.id,
		streamId: parsed.data.stream,
		present: parsed.data.present
	});
	return new Response(null, { status: 204 });
};
