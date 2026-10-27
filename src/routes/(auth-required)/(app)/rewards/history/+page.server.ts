import { error } from '@sveltejs/kit';
import { CONTEXT_DEPENDENCY } from '$lib/context';
import { contextSpaceIds } from '$lib/server/context';
import { listRewardClaims, rewardsDependency } from '$lib/server/rewards';
import type { PageServerLoad } from './$types';

/** The claim history, for the spaces the current context shows, as the wallets are. */
export const load: PageServerLoad = async ({ locals, depends }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	depends(CONTEXT_DEPENDENCY);
	const { spaceIds } = await contextSpaceIds(locals);
	for (const spaceId of spaceIds) {
		depends(rewardsDependency(spaceId));
	}
	return { claims: await listRewardClaims(locals.db, locals.user.id, spaceIds) };
};
