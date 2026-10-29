import { error, json } from '@sveltejs/kit';
import { appendDreamTurnSchema } from '$lib/schemas/dreamApi';
import { dreamsGuard } from '$lib/server/dream-api';
import { appendDreamTurn, describeDreamRefusal } from '$lib/server/dreams';
import type { RequestHandler } from './$types';

/**
 * Saving a turn, sealed: what the user did, or a passage once it has
 * finished arriving. Never replaced: a retry, another take or an edit is a
 * new turn beside the old one.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const userId = await dreamsGuard(locals);
	const parsed = appendDreamTurnSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const result = await appendDreamTurn(locals.db, userId, params.id, parsed.data);
	if (!result.ok) {
		const { status, message } = describeDreamRefusal(result.reason);
		error(status, message);
	}
	return json({ depth: result.depth }, { status: 201 });
};
