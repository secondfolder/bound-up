import { error, redirect } from '@sveltejs/kit';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { readImageConfig } from '$lib/server/daydream/image-config';
import {
	deleteDaydream,
	getDaydream,
	hasAcceptedDisclosure,
	purgeDaydreamPictures
} from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import { createMediaStore } from '$lib/server/media/backend';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
	locals: { db, user, settings },
	params,
	platform
}) => {
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
		available: readDaydreamConfig(settings, platform) !== null,
		accepted: await hasAcceptedDisclosure(db, user.id),
		// Whether this server makes pictures (docs/daydreams.md, "Pictures").
		picturesAvailable: readImageConfig(settings, platform) !== null
	};
};

export const actions: Actions = {
	/** Posted from the edit page, after the browser's own confirmation. */
	delete: async ({ locals: { db, user }, params, platform }) => {
		if (!user) {
			error(401, 'Not signed in');
		}
		await requireFeature(db, user.id, 'daydreams');
		if (!(await deleteDaydream(db, user.id, params.id))) {
			error(404, 'That daydream is not there any more.');
		}
		// After the delete, which is what proves it was this user's: its
		// pictures go by prefix, and a failure is logged, never thrown.
		const purge = await purgeDaydreamPictures(await createMediaStore({ platform }), params.id);
		if (purge.failed) {
			console.error(`could not purge pictures for daydream ${params.id}`);
		}
		redirect(303, '/daydreams');
	}
};
