import { error, json } from '@sveltejs/kit';
import { createVaultSchema } from '$lib/schemas/vault';
import { createVault, deleteLostSelfVault, isOwnSoloSpace } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/**
 * A space's vault. The space is the path's, never a scope in the body: a
 * solo space's vault is its member's own, a shared space's is the
 * partnership's. A space the caller is not in is a 404, the same as one that
 * does not exist, so a refusal never confirms an id is real.
 *
 * The user-wide listing stays at `GET /api/vaults`: it is every space's vault
 * at once, keyed by nothing.
 *
 * Outside both route groups, like every `/api` endpoint: a group guard is a
 * layout load, which never runs for a `+server.ts`, so each handler checks
 * `locals.user` itself.
 */

/**
 * Creates the space's vault with a wrap for every member. 409 when the space
 * already has one, which is a race between two devices rather than an error:
 * the device that lost fetches the listing again and opens the winner's.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = createVaultSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed request');
	}

	const result = await createVault(locals.db, locals.user.id, params.spaceId, parsed.data);
	if (!result.ok) {
		if (result.reason === 'exists') {
			error(409, 'This already has a vault');
		}
		if (result.reason === 'invalid-wraps') {
			error(400, "A vault needs one wrap per member, made for that member's current key");
		}
		error(404, 'Not found');
	}
	return json({ ok: true }, { status: 201 });
};

/**
 * Deletes the user's own vault once it can never be opened again, so a new
 * one can be made. Only in their own solo space: a shared space's vault is
 * never deleted this way. 409 while it still might be opened — see
 * `deleteLostSelfVault`.
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	if (!(await isOwnSoloSpace(locals.db, params.spaceId, locals.user.id))) {
		error(404, 'Not found');
	}
	if (!(await deleteLostSelfVault(locals.db, locals.user.id))) {
		error(409, 'This vault can still be opened, or brought back');
	}
	return new Response(null, { status: 204 });
};
