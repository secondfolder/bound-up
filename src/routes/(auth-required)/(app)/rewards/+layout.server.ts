import { error } from '@sveltejs/kit';
import { CONTEXT_DEPENDENCY } from '$lib/context';
import { contextSpaceIds } from '$lib/server/context';
import { listRewards, rewardsDependency } from '$lib/server/rewards';
import type { LayoutServerLoad } from './$types';

/**
 * The rewards, in the current context, as wallets: one per balance, never
 * merged (docs/rewards.md). Loaded for the layout, as the tasks list is, so
 * it stays on screen under the add, edit and history sheets; and returning
 * the context for the reason that one gives.
 */
export const load: LayoutServerLoad = async ({ locals, depends }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	depends(CONTEXT_DEPENDENCY);
	const { context, spaceIds } = await contextSpaceIds(locals);
	for (const spaceId of spaceIds) {
		depends(rewardsDependency(spaceId));
	}
	return {
		list: await listRewards(locals.db, locals.user.id, spaceIds),
		context
	};
};
