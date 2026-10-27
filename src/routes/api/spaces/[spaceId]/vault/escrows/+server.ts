import { error, json } from '@sveltejs/kit';
import { putEscrowSchema } from '$lib/schemas/vault';
import { deleteEscrows, isOwnSoloSpace, putEscrow } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/**
 * The escrows of the user's own vault, named by their solo space: only the
 * own vault is ever escrowed, so any other space is a 404. Which partner holds
 * one is `heldInSpaceId` in the body. See docs/encryption.md, "Escrow".
 */

/** Holds the user's own vault in escrow with one partner. */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	if (!(await isOwnSoloSpace(locals.db, params.spaceId, locals.user.id))) {
		error(404, 'Not found');
	}
	const parsed = putEscrowSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed request');
	}
	if (!(await putEscrow(locals.db, locals.user.id, parsed.data))) {
		error(404, 'Not found');
	}
	return json({ ok: true });
};

/** Drops every escrow of the user's own vault, after its shares were released. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	if (!(await isOwnSoloSpace(locals.db, params.spaceId, locals.user.id))) {
		error(404, 'Not found');
	}
	await deleteEscrows(locals.db, locals.user.id);
	return new Response(null, { status: 204 });
};
