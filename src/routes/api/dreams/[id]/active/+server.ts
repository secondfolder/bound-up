import { error, json } from '@sveltejs/kit';
import { setActiveDreamTurnSchema } from '$lib/schemas/dreamApi';
import { dreamsGuard } from '$lib/server/dream-api';
import { describeDreamRefusal, setActiveDreamTurn } from '$lib/server/dreams';
import type { RequestHandler } from './$types';

/** Moving to another version of a passage, or back to an earlier point. */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const userId = await dreamsGuard(locals);
	const parsed = setActiveDreamTurnSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const result = await setActiveDreamTurn(locals.db, userId, params.id, parsed.data.turnId);
	if (!result.ok) {
		const { status, message } = describeDreamRefusal(result.reason);
		error(status, message);
	}
	return json({ ok: true });
};
