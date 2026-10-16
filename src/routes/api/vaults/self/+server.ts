import { error } from '@sveltejs/kit';
import { deleteLostSelfVault } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/**
 * Deletes the user's own vault once it can never be opened again, so a new one
 * can be made. 409 while it still might be — see `deleteLostSelfVault`.
 */
export const DELETE: RequestHandler = async ({ locals }) => {
	// Endpoints carry their own auth check: see /api/keys/unlock-bundle.
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	if (!(await deleteLostSelfVault(locals.db, locals.user.id))) {
		error(409, 'This vault can still be opened, or brought back');
	}
	return new Response(null, { status: 204 });
};
