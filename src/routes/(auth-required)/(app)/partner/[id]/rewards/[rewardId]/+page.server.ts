import { error, redirect } from '@sveltejs/kit';
import { getPartnershipRewardForUser, updatePartnershipReward } from '$lib/server/rewards';
import { malformedSealed, readSealedReward, sealedRefusal } from '$lib/server/sealed-submit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const result = await getPartnershipRewardForUser(
		locals.db,
		params.id,
		locals.user.id,
		params.rewardId
	);
	if (!result) {
		error(404, 'Reward not found');
	}
	if (!result.partner.canManageRewards) {
		error(403, 'Only the controlling side can edit rewards here.');
	}

	return result;
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
		const result = await updatePartnershipReward(
			locals.db,
			params.id,
			locals.user.id,
			params.rewardId,
			{ ...submitted.input, expectedRevision: submitted.expectedRevision }
		);
		if (!result.ok) {
			if (result.reason === 'not-a-member') {
				error(404, 'Partner not found');
			}
			if (result.reason === 'not-found') {
				error(404, 'Reward not found');
			}
			return sealedRefusal(result.reason, 'reward');
		}
		redirect(303, `/partner/${params.id}/rewards`);
	}
};
