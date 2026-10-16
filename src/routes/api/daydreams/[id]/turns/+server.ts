import { error, json } from '@sveltejs/kit';
import { appendTurnSchema } from '$lib/schemas/daydreamForm';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { appendTurn, describeRefusal } from '$lib/server/daydreams';
import type { RequestHandler } from './$types';

/**
 * Saving a daydream's turns, sealed. See docs/daydreams.md.
 *
 * The browser seals each turn in the user's own vault — what they wrote, a
 * button they pressed, a passage once it has finished arriving — and posts it
 * here with the turn it follows. The server checks only the envelope, whose
 * daydream it is, and that the parent is in it. There is no replacing a
 * turn: a retry or a rewrite is a new turn beside the old one.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const userId = await daydreamGuard(locals);
	const parsed = appendTurnSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const { id, parentId, role, vaultId, ciphertext, payloadVersion } = parsed.data;
	const result = await appendTurn(locals.db, userId, params.id, {
		id,
		parentId,
		role,
		content: { vaultId, ciphertext, payloadVersion }
	});
	if (!result.ok) {
		const { status, message } = describeRefusal(result.reason);
		error(status, message);
	}
	return json({ position: result.position }, { status: 201 });
};
