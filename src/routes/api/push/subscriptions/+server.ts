import { error, json } from '@sveltejs/kit';
import { pushSubscribeSchema } from '$lib/schemas/pushSubscription';
import { readVapidConfig, savePushSubscription } from '$lib/server/push';
import type { RequestHandler } from './$types';

/**
 * Registers this browser for push notifications.
 *
 * Outside both route groups, like every `api/` route, so it carries its own
 * session check. The body is the browser's `PushSubscription` as JSON; the
 * reply is the id the device is known by from then on, which the browser keeps
 * so the live feed can say which device is watching.
 */
export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	if (!readVapidConfig(platform)) {
		// The settings screen does not offer the switch in this case, so reaching
		// here is a stale page rather than something to explain to a person.
		error(503, 'Push notifications are not set up on this server');
	}

	const parsed = pushSubscribeSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed subscription');
	}

	const id = await savePushSubscription(locals.db, locals.user.id, {
		endpoint: parsed.data.endpoint,
		p256dh: parsed.data.keys.p256dh,
		auth: parsed.data.keys.auth,
		label: parsed.data.label
	});
	return json({ id }, { status: 201 });
};
