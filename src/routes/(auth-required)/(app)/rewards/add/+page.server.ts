import { error, redirect } from '@sveltejs/kit';
import { spaceIdSchema } from '$lib/schemas/taskForm';
import { createReward } from '$lib/server/rewards';
import { malformedSealed, readSealedReward, sealedRefusal } from '$lib/server/sealed-submit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Adding a reward, in a sheet over the wallets, as adding a task is: to a
 * space the viewer chooses from the list's, posted as `spaceId`.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const { list } = await parent();
	// Nowhere to add one in this context; back to the list, as for tasks.
	if (!list.spaces.some((space) => space.canManage)) {
		redirect(303, '/rewards');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const formData = await request.formData();
		const spaceId = spaceIdSchema.safeParse(formData.get('spaceId'));
		// The title and description arrive sealed; see `rewardSealedSubmitSchema`.
		const submitted = await readSealedReward(formData);
		if (!(spaceId.success && submitted)) {
			return malformedSealed('reward');
		}
		const result = await createReward(
			locals.db,
			locals.user.id,
			spaceId.data,
			submitted.recordId,
			submitted.input
		);
		if (!result.ok) {
			return sealedRefusal(result.reason, 'reward');
		}
		redirect(303, '/rewards');
	}
};
