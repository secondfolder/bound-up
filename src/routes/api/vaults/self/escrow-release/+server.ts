import { error, json } from '@sveltejs/kit';
import { releaseEscrow } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/**
 * The relays partners passed on during a partner-assisted sign-in, and the
 * server's share of each — released to the account only after a sign-in it
 * confirmed by email. An empty list otherwise. See `releaseEscrow`.
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const { secret } = await locals.auth.$context;
	return json({ relays: await releaseEscrow(locals.db, secret, locals.user.id) });
};
