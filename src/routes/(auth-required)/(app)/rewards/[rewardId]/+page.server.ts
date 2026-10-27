import { error, redirect } from '@sveltejs/kit';
import { getRewardForViewer, updateReward } from '$lib/server/rewards';
import { malformedSealed, readSealedReward, sealedRefusal } from '$lib/server/sealed-submit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Editing a reward, in a sheet over the wallets. The reward carries its own
 * space (docs/contexts.md, "Items carry their own space"): a 404 for one in
 * no space of the viewer's, a 403 for one they may not edit — one set for them.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const found = await getRewardForViewer(locals.db, locals.user.id, params.rewardId);
	if (!found) {
		error(404, 'Reward not found');
	}
	if (!found.reward.canManage) {
		error(403, 'Only whoever set this reward can edit it.');
	}
	// The title and description are filled in by the page once it has opened
	// `reward.sealed`.
	return found;
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
		const result = await updateReward(locals.db, locals.user.id, params.rewardId, {
			...submitted.input,
			expectedRevision: submitted.expectedRevision
		});
		if (!result.ok) {
			if (result.reason === 'not-found') {
				error(404, 'Reward not found');
			}
			return sealedRefusal(result.reason, 'reward');
		}
		redirect(303, '/rewards');
	}
};
