import { error } from '@sveltejs/kit';
import { CONTEXT_DEPENDENCY } from '$lib/context';
import { contextSpaceIds } from '$lib/server/context';
import { listTasks, tasksDependency } from '$lib/server/tasks';
import type { LayoutServerLoad } from './$types';

/**
 * The tasks list, in the current context: your own, one partnership's, or
 * every space you are in at once (docs/tasks.md, docs/contexts.md). Loaded
 * for the layout rather than the page, so the list stays on screen under the
 * sheets its child routes open (add, edit, history; `RouteSheet`).
 *
 * The context is returned here as well as by the app layout, and this one
 * wins: a client-side navigation between these routes re-runs this load but
 * not the app layout's, and the switcher must say what the list shows.
 */
export const load: LayoutServerLoad = async ({ locals, depends }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	depends(CONTEXT_DEPENDENCY);
	const { context, spaceIds } = await contextSpaceIds(locals);
	for (const spaceId of spaceIds) {
		depends(tasksDependency(spaceId));
	}
	return {
		list: await listTasks(locals.db, locals.user, spaceIds),
		context
	};
};
