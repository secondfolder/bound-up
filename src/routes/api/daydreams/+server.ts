import { json } from '@sveltejs/kit';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { listDaydreams } from '$lib/server/daydreams';
import type { RequestHandler } from './$types';

/**
 * The user's daydreams, setups sealed, for naming a new one: the browser
 * opens them to find the titles already given to daydreams from the same
 * idea, so the model can be told not to repeat them (docs/daydreams.md,
 * "Naming"). The same rows the daydreams page lists; the server cannot read
 * a title, so it cannot do the filtering itself.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const userId = await daydreamGuard(locals);
	const daydreams = await listDaydreams(locals.db, userId);
	return json({ daydreams: daydreams.map(({ id, setup }) => ({ id, setup })) });
};
