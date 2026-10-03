import { error, json } from '@sveltejs/kit';
import { pushOwnershipSchema } from '$lib/schemas/pushSubscription';
import { checkPushOwnership } from '$lib/server/push';
import type { RequestHandler } from './$types';

/**
 * Whose this browser's subscription is: the signed-in account's, nobody's, or
 * another account's — in which case it is deleted, so that account stops being
 * notified on a browser somebody else is now signed in on.
 *
 * Called by `resyncPush` on every full load of the app shell and of the
 * settings screen. See `checkPushOwnership`.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = pushOwnershipSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed subscription');
	}
	return json(await checkPushOwnership(locals.db, locals.user.id, parsed.data.endpoint));
};
