import { error } from '@sveltejs/kit';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { acceptDisclosure, hasAcceptedDisclosure } from '$lib/server/daydreams';
import { listDreams } from '$lib/server/dreams';
import { requireFeature } from '$lib/server/features';
import type { Actions, PageServerLoad } from './$types';

/**
 * The new engine's daydreams (docs/dreams.md): the list, sealed, and a box
 * for a new one. Checked here rather than trusted from the layout's
 * `features`, which only decides what is shown.
 */
export const load: PageServerLoad = async ({ locals: { db, user, settings }, platform }) => {
	if (!user) {
		error(401, 'Not signed in');
	}
	await requireFeature(db, user.id, 'dreams');
	const available = readDaydreamConfig(settings, platform) !== null;
	const accepted = await hasAcceptedDisclosure(db, user.id);
	return {
		userId: user.id,
		available,
		accepted,
		dreams: available && accepted ? await listDreams(db, user.id) : []
	};
};

export const actions: Actions = {
	/** The same acceptance the first engine asks for: the same provider, on the same terms. */
	acceptDisclosure: async ({ locals: { db, user } }) => {
		if (!user) {
			error(401, 'Not signed in');
		}
		await requireFeature(db, user.id, 'dreams');
		await acceptDisclosure(db, user.id);
		return { accepted: true };
	}
};
