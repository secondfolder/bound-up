import { listUnreadCounts } from '$lib/server/messaging';
import { getHomeRewardsWidget } from '$lib/server/rewards';
import { getHomeTasksWidget } from '$lib/server/tasks';
import type { PageServerLoad } from './$types';

/** Every card in its empty state, for the session-less degrade path below. */
function emptyPage() {
	return {
		unread: [],
		tasks: { viewerActs: true, ready: [], readyCount: 0, waitingCount: 0, activeCount: 0 },
		rewards: {
			viewerActs: true,
			balances: [],
			claimable: [],
			claimableCount: 0,
			activeCount: 0
		}
	};
}

export const load: PageServerLoad = async ({ locals, parent, depends }) => {
	// The group guard has already run for a layout load. Degrade rather than
	// throw if that ever changes.
	if (!locals.user) {
		return emptyPage();
	}

	// The app shell's layout has already loaded the partner list for the bottom
	// nav, so take it from there rather than reading `partnerships` a second
	// time. It also carries the per-viewer name, which is resolved in exactly
	// one place (invariant 12).
	const { partners } = await parent();

	depends('messages:unread');
	// The same keys the /home/tasks and /home/rewards loads use, so completing a
	// task or claiming a reward refreshes the cards here too.
	depends('tasks:home');
	depends('rewards:home');

	// No guides query: the guides card is hidden until the feature is ready to
	// advertise, and D1 charges for rows read by a card nobody sees. When it
	// comes back, preview the first few in /home/guides' order (createdAt, then
	// id), limited in SQL, with the total counted separately.
	const [unread, tasks, rewards] = await Promise.all([
		listUnreadCounts(locals.db, locals.user.id, partners),
		// Both take the layout's partner list: the cards mirror /home/tasks and
		// /home/rewards, which show your own things AND each partner's.
		getHomeTasksWidget(locals.db, locals.user.id, partners),
		getHomeRewardsWidget(locals.db, locals.user.id, partners)
	]);

	return {
		unread,
		tasks,
		rewards
	};
};
