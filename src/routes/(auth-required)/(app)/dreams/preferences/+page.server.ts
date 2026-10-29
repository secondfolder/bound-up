import { error } from '@sveltejs/kit';
import { requireFeature } from '$lib/server/features';
import type { PageServerLoad } from './$types';

/** The user's preferences for every daydream: sealed, so the page opens them. */
export const load: PageServerLoad = async ({ locals: { db, user } }) => {
	if (!user) {
		error(401, 'Not signed in');
	}
	await requireFeature(db, user.id, 'dreams');
	return { userId: user.id };
};
