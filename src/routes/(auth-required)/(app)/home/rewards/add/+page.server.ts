import { error, redirect } from '@sveltejs/kit';
import { createSelfReward } from '$lib/server/rewards';
import { malformedSealed, readSealedReward, sealedRefusal } from '$lib/server/sealed-submit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		// The title and description arrive sealed; see `rewardSealedSubmitSchema`.
		const submitted = await readSealedReward(request);
		if (!submitted) {
			return malformedSealed('reward');
		}
		const result = await createSelfReward(
			locals.db,
			locals.user.id,
			submitted.recordId,
			submitted.input
		);
		if (!result.ok) {
			return sealedRefusal(result.reason, 'reward');
		}
		redirect(303, '/home/rewards');
	}
};
