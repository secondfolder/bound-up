import { error } from '@sveltejs/kit';
import { getKinkList, hasKinkListVersions, listSharedKinkLists } from '$lib/server/kink-lists';
import type { LayoutServerLoad } from './$types';

/**
 * The signed-in kink list's one load: the person's own list, sealed. Every
 * page under here shares the store the layout builds from it, so moving
 * between categories never reopens the list or loses an unsaved answer.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const [list, shared, hasHistory] = await Promise.all([
		getKinkList(locals.db, locals.user.id, 'self'),
		listSharedKinkLists(locals.db, locals.user.id),
		hasKinkListVersions(locals.db, locals.user.id)
	]);
	// `hasHistory`: History is offered only once there is a version to show.
	// A version kept during this visit shows it from the next load.
	return { list, shared, hasHistory };
};
