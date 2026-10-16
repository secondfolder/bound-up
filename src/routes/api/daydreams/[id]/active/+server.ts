import { error, json } from '@sveltejs/kit';
import { setActiveSchema } from '$lib/schemas/daydreamForm';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { describeRefusal, setActiveTurn } from '$lib/server/daydreams';
import type { RequestHandler } from './$types';

/**
 * Moves the user to another turn — switching branch, or carrying on from an
 * earlier point — so the next visit, on any device, opens where they are.
 */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const userId = await daydreamGuard(locals);
	const parsed = setActiveSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const result = await setActiveTurn(locals.db, userId, params.id, parsed.data.turnId);
	if (!result.ok) {
		const { status, message } = describeRefusal(result.reason);
		error(status, message);
	}
	return json({ ok: true });
};
