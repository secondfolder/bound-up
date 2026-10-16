import { error, redirect } from '@sveltejs/kit';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { deleteDaydream, getDaydream, hasAcceptedDisclosure } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { db, user }, params, platform }) => {
	if (!user) {
		error(401, 'Not signed in');
	}
	// Before the lookup, so an account without the feature cannot tell a real
	// daydream id from a made-up one by the 404.
	await requireFeature(db, user.id, 'daydreams');
	const daydream = await getDaydream(db, user.id, params.id);
	if (!daydream) {
		error(404, 'That daydream is not there any more.');
	}
	return {
		daydream,
		available: readDaydreamConfig(platform) !== null,
		accepted: await hasAcceptedDisclosure(db, user.id)
	};
};

export const actions: Actions = {
	/** Posted from the edit page, after the browser's own confirmation. */
	delete: async ({ locals: { db, user }, params }) => {
		if (!user) {
			error(401, 'Not signed in');
		}
		await requireFeature(db, user.id, 'daydreams');
		if (!(await deleteDaydream(db, user.id, params.id))) {
			error(404, 'That daydream is not there any more.');
		}
		redirect(303, '/daydreams');
	}
};
