import { error } from '@sveltejs/kit';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { acceptDisclosure, hasAcceptedDisclosure, listDaydreams } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { db, user, settings }, platform }) => {
	if (!user) {
		error(401, 'Not signed in');
	}
	// Checked here rather than trusted from the layout's `features`, which only
	// decides what is shown.
	await requireFeature(db, user.id, 'daydreams');

	const available = readDaydreamConfig(settings, platform) !== null;
	const accepted = await hasAcceptedDisclosure(db, user.id);
	return {
		available,
		accepted,
		// Not read until the disclosure is accepted: the page shows that instead.
		daydreams: available && accepted ? await listDaydreams(db, user.id) : []
	};
};

export const actions: Actions = {
	/**
	 * "I understand": recorded on the server, because the reply endpoint is
	 * what has to refuse until it is, and device storage would be one device's
	 * word for it.
	 */
	acceptDisclosure: async ({ locals: { db, user } }) => {
		if (!user) {
			error(401, 'Not signed in');
		}
		await requireFeature(db, user.id, 'daydreams');
		await acceptDisclosure(db, user.id);
		return { accepted: true };
	}
};
