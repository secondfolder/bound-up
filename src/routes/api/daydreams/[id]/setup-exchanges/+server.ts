import { error, json } from '@sveltejs/kit';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { readSetupExchanges } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import type { RequestHandler } from './$types';

/**
 * How a daydream was set up, sealed, for debug mode's raw log: the
 * suggestion requests that wrote its draft, kept with the create
 * (docs/debug-mode.md, "Setup exchanges"). Behind the feature, as a
 * daydream's own exchanges are.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const userId = await daydreamGuard(locals);
	await requireFeature(locals.db, userId, 'debugMode');
	const exchanges = await readSetupExchanges(locals.db, userId, params.id);
	if (!exchanges) {
		error(404, 'That daydream is not there any more.');
	}
	return json({ exchanges });
};
