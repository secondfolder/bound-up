import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
	daydreamSealedSubmitSchema,
	daydreamSetupFormSchema,
	EMPTY_DAYDREAM_SETUP
} from '$lib/schemas/daydreamForm';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { readImageConfig } from '$lib/server/daydream/image-config';
import {
	describeRefusal,
	getDaydreamSetup,
	getLibrary,
	hasAcceptedDisclosure,
	updateDaydreamSetup
} from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
	locals: { db, user, settings },
	params,
	platform
}) => {
	if (!user) {
		error(401, 'Not signed in');
	}
	await requireFeature(db, user.id, 'daydreams');
	const daydream = await getDaydreamSetup(db, user.id, params.id);
	if (!daydream) {
		error(404, 'That daydream is not there any more.');
	}
	const [library, accepted] = await Promise.all([
		getLibrary(db, user.id),
		hasAcceptedDisclosure(db, user.id)
	]);
	return {
		daydream,
		// Empty: the setup is sealed, so the browser fills the form once it has
		// opened it.
		setupForm: await superValidate(EMPTY_DAYDREAM_SETUP, zod4(daydreamSetupFormSchema), {
			errors: false
		}),
		library,
		accepted,
		available: readDaydreamConfig(settings, platform) !== null,
		picturesAvailable: readImageConfig(settings, platform) !== null
	};
};

export const actions: Actions = {
	default: async ({ locals: { db, user }, params, request }) => {
		if (!user) {
			error(401, 'Not signed in');
		}
		await requireFeature(db, user.id, 'daydreams');

		const form = await superValidate(request, zod4(daydreamSealedSubmitSchema));
		// The record is the daydream itself: a setup sealed to another id would
		// not open as this one.
		if (!form.valid || form.data.recordId !== params.id) {
			return fail(400, { error: 'That could not be saved. Reload and try again.' });
		}
		const { vaultId, ciphertext, payloadVersion, expectedRevision } = form.data;
		const result = await updateDaydreamSetup(db, user.id, params.id, {
			setup: { vaultId, ciphertext, payloadVersion },
			expectedRevision: expectedRevision ?? 0
		});
		if (!result.ok) {
			const { status, message } = describeRefusal(result.reason);
			return fail(status, { error: message });
		}
		redirect(303, `/daydreams/${params.id}`);
	}
};
