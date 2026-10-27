import { error } from '@sveltejs/kit';
import { CONTEXT_DEPENDENCY } from '$lib/context';
import { contextSpaceIds } from '$lib/server/context';
import { listTaskCompletions, tasksDependency } from '$lib/server/tasks';
import type { PageServerLoad } from './$types';

/** The completion history, for the spaces the current context shows, as the list is. */
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	depends(CONTEXT_DEPENDENCY);
	const { spaceIds } = await contextSpaceIds(locals);
	for (const spaceId of spaceIds) {
		depends(tasksDependency(spaceId));
	}
	return { completions: await listTaskCompletions(locals.db, locals.user.id, spaceIds) };
};
