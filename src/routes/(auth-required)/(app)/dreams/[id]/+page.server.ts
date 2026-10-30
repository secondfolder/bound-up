import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { ResearchMode } from '$lib/dream/setup-progress';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { readImageConfig } from '$lib/server/daydream/image-config';
import { readVoiceConfig } from '$lib/server/daydream/voice-config';
import { hasAcceptedDisclosure } from '$lib/server/daydreams';
import { getDream } from '$lib/server/dreams';
import { requireFeature, userHasFeature } from '$lib/server/features';
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
	const voice = readVoiceConfig(settings, platform);
	const story = readDaydreamConfig(settings, platform);
	let research: ResearchMode = 'none';
	if (story?.readsLinks) {
		research = 'self';
	} else if (story?.researchModel) {
		research = 'model';
	}
	return {
		dream,
		userId: user.id,
		available: story !== null,
		/** How a brief is researched here, so the setup page shows the steps really taken. */
		research,
		pictures: readImageConfig(settings, platform) !== null,
		/**
		 * Read aloud, when the server has a voice provider and the account the
		 * feature: which preset the narrator is, so characters get others.
		 */
		voice:
			voice && (await userHasFeature(db, user.id, 'dreamVoice'))
				? { narratorPreset: voice.narratorPreset }
				: null
	};
};
