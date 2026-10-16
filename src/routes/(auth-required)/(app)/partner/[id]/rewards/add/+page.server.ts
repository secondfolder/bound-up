import { error, redirect } from '@sveltejs/kit';
import { createPartnershipReward, requireRewardMembership } from '$lib/server/rewards';
import { malformedSealed, readSealedReward, sealedRefusal } from '$lib/server/sealed-submit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const membership = await requireRewardMembership(locals.db, params.id, locals.user.id);
	if (!membership) {
		error(404, 'Partner not found');
	}
	if (!membership.canManage) {
		error(403, 'Only the controlling side can add rewards here.');
	}

	return {
		partner: {
			id: membership.partnership.id,
			name: membership.partnership.partnerName
		}
	};
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const submitted = await readSealedReward(request);
		if (!submitted) {
			return malformedSealed('reward');
		}
		const result = await createPartnershipReward(
			locals.db,
			params.id,
			locals.user.id,
			submitted.recordId,
			submitted.input
		);
		if (!result.ok) {
			if (result.reason === 'not-a-member') {
				error(404, 'Partner not found');
			}
			return sealedRefusal(result.reason, 'reward');
		}
		redirect(303, `/partner/${params.id}/rewards`);
	}
};
