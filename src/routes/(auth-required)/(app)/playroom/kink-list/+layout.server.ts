import { error } from '@sveltejs/kit';
import { getKinkList } from '$lib/server/kink-lists';
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
	return { list: await getKinkList(locals.db, locals.user.id, 'self') };
};
