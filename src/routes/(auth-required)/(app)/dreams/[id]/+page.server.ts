import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { hasAcceptedDisclosure } from '$lib/server/daydreams';
import { getDream } from '$lib/server/dreams';
import { requireFeature } from '$lib/server/features';
import type { PageServerLoad } from './$types';

/** One daydream: its setup and the branch being read, sealed, for the page to open. */
export const load: PageServerLoad = async ({
	locals: { db, user, settings },
	params,
	platform
}) => {
	if (!user) {
		error(401, 'Not signed in');
	}
	await requireFeature(db, user.id, 'dreams');
	if (!(await hasAcceptedDisclosure(db, user.id))) {
		redirect(303, resolve('/(auth-required)/(app)/dreams'));
	}
	const dream = await getDream(db, user.id, params.id);
	if (!dream) {
		error(404, 'That daydream is not there any more.');
	}
	return { dream, userId: user.id, available: readDaydreamConfig(settings, platform) !== null };
};
