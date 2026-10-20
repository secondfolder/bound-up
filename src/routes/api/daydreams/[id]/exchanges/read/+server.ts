import { error, json } from '@sveltejs/kit';
import { readExchangesSchema } from '$lib/schemas/daydreamForm';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { readExchanges } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import type { RequestHandler } from './$types';

/**
 * The exchanges behind some turns, sealed, for debug mode's raw log: the ones
 * that wrote them, and failed ones that answered them. A POST because the ids
 * would not fit in a URL, a few turns at a time because each exchange can be
 * most of a megabyte. Behind the feature, as the save is.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const userId = await daydreamGuard(locals);
	await requireFeature(locals.db, userId, 'debugMode');
	const parsed = readExchangesSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be loaded. Reload and try again.');
	}
	const exchanges = await readExchanges(locals.db, userId, params.id, parsed.data.turnIds);
	if (!exchanges) {
		error(404, 'That daydream is not there any more.');
	}
	return json({ exchanges });
};
