import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { pickIdeas } from '$lib/daydream/starters';
import {
	daydreamSealedSubmitSchema,
	daydreamSetupFormSchema,
	EMPTY_DAYDREAM_SETUP
} from '$lib/schemas/daydreamForm';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { readImageConfig } from '$lib/server/daydream/image-config';
import {
	createDaydream,
	describeRefusal,
	getLibrary,
	hasAcceptedDisclosure
} from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { db, user }, platform }) => {
	if (!user) {
		error(401, 'Not signed in');
	}
	await requireFeature(db, user.id, 'daydreams');
	const [library, accepted] = await Promise.all([
		getLibrary(db, user.id),
		hasAcceptedDisclosure(db, user.id)
	]);
	return {
		setupForm: await superValidate(EMPTY_DAYDREAM_SETUP, zod4(daydreamSetupFormSchema), {
			errors: false
		}),
		library,
		accepted,
		available: readDaydreamConfig(platform) !== null,
		picturesAvailable: readImageConfig(platform) !== null,
		// Drawn here rather than in the component so the server's render and
		// hydration show the same few (`pickIdeas`).
		ideas: pickIdeas()
	};
};

export const actions: Actions = {
	default: async ({ locals: { db, user }, request }) => {
		if (!user) {
			error(401, 'Not signed in');
		}
		await requireFeature(db, user.id, 'daydreams');

		// The setup arrives sealed; see `DaydreamSetupForm.svelte`.
		const form = await superValidate(request, zod4(daydreamSealedSubmitSchema));
		if (!form.valid) {
			return fail(400, { error: 'That could not be saved. Reload and try again.' });
		}
		const { recordId, vaultId, ciphertext, payloadVersion } = form.data;
		const result = await createDaydream(db, user.id, recordId, {
			vaultId,
			ciphertext,
			payloadVersion
		});
		if (!result.ok) {
			const { status, message } = describeRefusal(result.reason);
			return fail(status, { error: message });
		}
		redirect(303, `/daydreams/${recordId}`);
	}
};
