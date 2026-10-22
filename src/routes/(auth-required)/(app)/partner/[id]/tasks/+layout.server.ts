import { error } from '@sveltejs/kit';
import { getPartnershipTasksPage } from '$lib/server/tasks';
import type { LayoutServerLoad } from './$types';

/**
 * The list, loaded for the layout rather than the page: the list stays on screen
 * under the sheets its child routes open (add, edit, history; `RouteSheet`).
 */
export const load: LayoutServerLoad = async ({ locals, params, depends }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	depends(`tasks:partner:${params.id}`);

	const page = await getPartnershipTasksPage(
		locals.db,
		params.id,
		locals.user.id,
		locals.user.timezone
	);
	if (!page) {
		error(404, 'Partner not found');
	}
	return page;
};
