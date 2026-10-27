import { error, json } from '@sveltejs/kit';
import { escrowShareSchema } from '$lib/schemas/vault';
import { isOwnSoloSpace, issueEscrowShare } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/**
 * The server's share for an escrow the user is about to make of their own
 * vault, named by their solo space — only for an id no escrow has yet. See
 * `issueEscrowShare` for why an existing one's share is never handed out here.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	if (!(await isOwnSoloSpace(locals.db, params.spaceId, locals.user.id))) {
		error(404, 'Not found');
	}
	const parsed = escrowShareSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed request');
	}
	const { secret } = await locals.auth.$context;
	const share = await issueEscrowShare(locals.db, secret, locals.user.id, parsed.data.escrowId);
	if (!share) {
		error(409, 'That escrow already exists, or there is no vault to escrow');
	}
	return json({ share });
};
