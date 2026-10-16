import { error, redirect } from '@sveltejs/kit';
import { getSelfRewardForUser, updateSelfReward } from '$lib/server/rewards';
import { malformedSealed, readSealedReward, sealedRefusal } from '$lib/server/sealed-submit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const reward = await getSelfRewardForUser(locals.db, locals.user.id, params.rewardId);
	if (!reward) {
		error(404, 'Reward not found');
	}

	// A sealed reward's title and description are filled in by the page once
	// it has opened `reward.sealed`.
	return { reward };
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const submitted = await readSealedReward(request);
		if (!(submitted && submitted.recordId === params.rewardId)) {
			return malformedSealed('reward');
		}
		const result = await updateSelfReward(locals.db, locals.user.id, params.rewardId, {
			...submitted.input,
			expectedRevision: submitted.expectedRevision
		});
		if (!result.ok) {
			if (result.reason === 'not-found') {
				error(404, 'Reward not found');
			}
			return sealedRefusal(result.reason, 'reward');
		}
		redirect(303, '/home/rewards');
	}
};
