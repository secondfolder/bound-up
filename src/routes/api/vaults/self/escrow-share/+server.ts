import { error, json } from '@sveltejs/kit';
import { escrowShareSchema } from '$lib/schemas/vault';
import { issueEscrowShare } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/**
 * The server's share for an escrow the user is about to make — only for an id
 * no escrow has yet. See `issueEscrowShare` for why an existing one's share is
 * never handed out here.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
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
