import { getSelfRewardsSection, listHomePartnerRewardSections } from '$lib/server/rewards';
import type { LayoutServerLoad } from './$types';

/**
 * The list, loaded for the layout rather than the page: the list stays on screen
 * under the sheets its child routes open (add, edit, history; `RouteSheet`).
 */
export const load: LayoutServerLoad = async ({ locals, parent, depends }) => {
	if (!locals.user) {
		return { selfRewards: { credits: 0, rewards: [], claims: [] }, partnerRewards: [] };
	}

	const { partners } = await parent();

	depends('rewards:home');

	const [selfRewards, partnerRewards] = await Promise.all([
		getSelfRewardsSection(locals.db, locals.user.id),
		listHomePartnerRewardSections(locals.db, locals.user.id, partners)
	]);

	return { selfRewards, partnerRewards };
};
