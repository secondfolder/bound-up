import { error, json } from '@sveltejs/kit';
import { pushDeviceUpdateSchema } from '$lib/schemas/pushSubscription';
import { deletePushDevice, updatePushDevice } from '$lib/server/push';
import type { RequestHandler } from './$types';

/**
 * One of the signed-in user's devices.
 *
 * Both handlers scope the write to `locals.user`, so a device id belonging to
 * somebody else is a 404 rather than a change — the same 404-not-403 as every
 * partner route, so the reply never confirms that an id exists.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = pushDeviceUpdateSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed change');
	}
	if (!(await updatePushDevice(locals.db, locals.user.id, params.id, parsed.data))) {
		error(404, 'Not found');
	}
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	if (!(await deletePushDevice(locals.db, locals.user.id, params.id))) {
		error(404, 'Not found');
	}
	return json({ ok: true });
};
