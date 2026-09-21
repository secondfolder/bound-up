import { guides } from '$lib/server/db/schema';
import { listUnreadCounts } from '$lib/server/messaging';
import { getHomeRewardsWidget } from '$lib/server/rewards';
import { getHomeTasksWidget } from '$lib/server/tasks';
import type { PageServerLoad } from './$types';

/** Rows the guides card previews before it falls back to "and N more". */
const GUIDES_PREVIEW_LIMIT = 3;

/** Every card in its empty state, for the session-less degrade path below. */
function emptyPage() {
	return {
		unread: [],
		guides: { guides: [], total: 0 },
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
	if (!locals.user) return emptyPage();

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

	const [unread, guideRows, guideCount, tasks, rewards] = await Promise.all([
		listUnreadCounts(locals.db, locals.user.id, partners),
		// Same ordering as /home/guides, so the card previews the top of the list
		// the link goes to rather than an unrelated three. Limited in SQL, with
		// the total counted separately, because D1 charges for rows read and the
		// card never shows more than GUIDES_PREVIEW_LIMIT of them.
		locals.db.query.guides.findMany({
			columns: { id: true, title: true },
			orderBy: (guide, { asc }) => [asc(guide.createdAt), asc(guide.id)],
			limit: GUIDES_PREVIEW_LIMIT
		}),
		locals.db.$count(guides),
		// Both take the layout's partner list: the cards mirror /home/tasks and
		// /home/rewards, which show your own things AND each partner's.
		getHomeTasksWidget(locals.db, locals.user.id, partners),
		getHomeRewardsWidget(locals.db, locals.user.id, partners)
	]);

	return {
		unread,
		guides: { guides: guideRows, total: guideCount },
		tasks,
		rewards
	};
};
