import { getSelfTasksSection, listHomePartnerTaskSections } from '$lib/server/tasks';
import type { LayoutServerLoad } from './$types';

/**
 * The list, loaded for the layout rather than the page: the list stays on screen
 * under the sheets its child routes open (add, edit, history; `RouteSheet`).
 */
export const load: LayoutServerLoad = async ({ locals, parent, depends }) => {
	if (!locals.user) {
		return { selfTasks: { tasks: [], completions: [], credits: 0 }, partnerTasks: [] };
	}

	const { partners } = await parent();

	depends('tasks:home');

	const [selfTasks, partnerTasks] = await Promise.all([
		getSelfTasksSection(locals.db, locals.user.id, locals.user.timezone),
		listHomePartnerTaskSections(locals.db, locals.user.id, locals.user.timezone, partners)
	]);

	return { selfTasks, partnerTasks };
};
