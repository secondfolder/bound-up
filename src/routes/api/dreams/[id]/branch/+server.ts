import { error, json } from '@sveltejs/kit';
import { dreamsGuard } from '$lib/server/dream-api';
import { readDreamBranch } from '$lib/server/dreams';
import { isClientId } from '$lib/vault';
import type { RequestHandler } from './$types';

/** Another branch's turns, detail and summaries, sealed, for moving to it. */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const userId = await dreamsGuard(locals);
	const turnId = url.searchParams.get('turn');
	if (!isClientId(turnId)) {
		error(400, 'That could not be read. Reload and try again.');
	}
	const branch = await readDreamBranch(locals.db, userId, params.id, turnId);
	if (!branch) {
		error(404, 'That part of the story is not there any more. Reload to see the latest.');
	}
	return json(branch);
};
