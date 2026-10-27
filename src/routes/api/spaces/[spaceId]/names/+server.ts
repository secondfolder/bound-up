import { error, json } from '@sveltejs/kit';
import { partnerNamesMoveSchema } from '$lib/schemas/partnerForm';
import { inviteNamesToMove, moveInviteNamesIntoVault } from '$lib/server/partnerships';
import type { RequestHandler } from './$types';

/**
 * Moving a partnership's names out of its accepted invite and into its vault.
 * See `inviteNamesToMove` and docs/partners.md, "Names are sealed".
 *
 * Outside both route groups, like every `/api` endpoint: a group guard is a
 * layout load, which never runs for a `+server.ts`, so each handler checks
 * `locals.user` itself.
 */

/** Where this viewer's device can read the names from, or `{ names: null }` for nothing to move. */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const result = await inviteNamesToMove(locals.db, params.spaceId, locals.user.id);
	if (!result) {
		error(404, 'Not found');
	}
	return json(result);
};

/** Stores the names sealed in the vault, and clears the invite. */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = partnerNamesMoveSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed request');
	}
	const result = await moveInviteNamesIntoVault(
		locals.db,
		params.spaceId,
		locals.user.id,
		parsed.data
	);
	if (!result.ok) {
		error(result.reason === 'forbidden' ? 403 : 400, result.reason);
	}
	return json({ moved: result.moved });
};
