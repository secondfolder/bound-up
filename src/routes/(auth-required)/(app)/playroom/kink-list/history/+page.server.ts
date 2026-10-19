import { error } from '@sveltejs/kit';
import { listKinkListVersions } from '$lib/server/kink-lists';
import type { PageServerLoad } from './$types';

/** The versions kept of your own list, sealed. The list as it is now comes from the layout's store. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	return { versions: await listKinkListVersions(locals.db, locals.user.id) };
};
