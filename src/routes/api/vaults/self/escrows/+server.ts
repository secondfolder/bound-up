import { error, json } from '@sveltejs/kit';
import { putEscrowSchema } from '$lib/schemas/vault';
import { deleteEscrows, putEscrow } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/** Holds the user's own vault in escrow with one partner. See docs/encryption.md, "Escrow". */
export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
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
export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	await deleteEscrows(locals.db, locals.user.id);
	return new Response(null, { status: 204 });
};
