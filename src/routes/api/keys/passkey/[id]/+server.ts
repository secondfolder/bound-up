import { error, json } from '@sveltejs/kit';
import { deletePasskeyWithWrap } from '$lib/server/keys';
import type { RequestHandler } from './$types';

/**
 * Removes a passkey and the wrap sealed to it.
 *
 * Instead of Better Auth's own `delete-passkey`, which knows nothing about
 * wraps and would leave this passkey's behind in every bundle. `id` is Better
 * Auth's passkey row id, as the Security page lists it.
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	// See the note in ../../unlock-bundle: endpoints carry their own auth check.
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	if (!(await deletePasskeyWithWrap(locals.db, locals.user.id, params.id))) {
		error(404, 'No such passkey');
	}
	return json({ ok: true });
};
