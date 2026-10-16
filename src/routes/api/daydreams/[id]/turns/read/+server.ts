import { error, json } from '@sveltejs/kit';
import { readTurnsSchema } from '$lib/schemas/daydreamForm';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { readTurns } from '$lib/server/daydreams';
import type { RequestHandler } from './$types';

/**
 * Opens turns by id: another branch's, when someone moves to it, or the ones
 * the branch map is showing. A POST because the ids would not fit in a URL.
 * The page load sends only the branch being read (`getDaydream`).
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const userId = await daydreamGuard(locals);
	const parsed = readTurnsSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be loaded. Reload and try again.');
	}
	const turns = await readTurns(locals.db, userId, params.id, parsed.data.ids);
	if (!turns) {
		error(404, 'That daydream is not there any more.');
	}
	return json({ turns });
};
