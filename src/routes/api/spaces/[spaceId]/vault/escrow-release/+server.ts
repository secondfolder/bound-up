import { error, json } from '@sveltejs/kit';
import { isOwnSoloSpace, releaseEscrow } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/**
 * The relays partners passed on during a partner-assisted sign-in, and the
 * server's share of each — released to the account only after a sign-in it
 * confirmed by email, and only in its own solo space, where its own vault is.
 * An empty list otherwise. See `releaseEscrow`.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	if (!(await isOwnSoloSpace(locals.db, params.spaceId, locals.user.id))) {
		error(404, 'Not found');
	}
	const { secret } = await locals.auth.$context;
	return json({ relays: await releaseEscrow(locals.db, secret, locals.user.id) });
};
