import { hasFeature } from '$lib/features';
import { getDaydreamsWidget } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { guides } from '$lib/server/db/schema';
import { latestIqTestResult } from '$lib/server/iq-test';
import { listUnreadCounts } from '$lib/server/messaging';
import { getHomeNotebookWidget } from '$lib/server/notebook';
import { getRewardsWidget, rewardsDependency } from '$lib/server/rewards';
import { getTasksWidget, tasksDependency } from '$lib/server/tasks';
import type {
	DaydreamsWidgetView,
	GuidesWidgetView,
	IqTestResultView,
	WidgetItemView
} from '$lib/types';
import type { PageServerLoad } from './$types';

/** Rows the guides card previews before it falls back to "and N more". */
const GUIDES_PREVIEW_LIMIT = 3;

/** Likewise for the Daydreams card. */
const DAYDREAMS_PREVIEW_LIMIT = 3;

/** Every card in its empty state, for the session-less degrade path below. */
function emptyPage() {
	return {
		unread: [],
		guides: null as GuidesWidgetView | null,
		daydreams: null as DaydreamsWidgetView | null,
		tasks: { viewerActs: true, ready: [], readyCount: 0, waitingCount: 0, activeCount: 0 },
		rewards: {
			viewerActs: true,
			balances: [],
			claimable: [],
			claimableCount: 0,
			activeCount: 0
		},
		latestIq: null as IqTestResultView | null,
		notebook: [] as WidgetItemView[]
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
	const [{ partners, features }, spaces] = await Promise.all([parent(), locals.contextSpaces()]);

	// The tasks and rewards cards cover every space the viewer is in — what
	// /tasks and /rewards show in Everyone, which is where they lead.
	const spaceIds = spaces.map((space) => space.spaceId);
	const names = new Map(partners.map((partner) => [partner.id, partner.names]));

	depends('messages:unread');
	// The same keys the /tasks and /rewards loads use, so completing a task or
	// claiming a reward refreshes the cards here too.
	for (const spaceId of spaceIds) {
		depends(tasksDependency(spaceId), rewardsDependency(spaceId));
	}
	// The solo notebook's own key, so an entry written elsewhere refreshes the card.
	depends('notebook:self');

	const [unread, guidesCard, daydreamsCard, tasks, rewards, latestIq, notebook] = await Promise.all(
		[
			listUnreadCounts(locals.db, locals.user.id, partners),
			// Only for an account that holds guides: D1 charges for rows read by a
			// card nobody sees. This decides what is shown, which is all the layout's
			// `features` may be used for; /home/guides checks for itself.
			hasFeature(features, 'guides') ? loadGuidesCard(locals.db) : null,
			// The same for Daydreams; /daydreams checks for itself.
			hasFeature(features, 'daydreams')
				? getDaydreamsWidget(locals.db, locals.user.id, DAYDREAMS_PREVIEW_LIMIT)
				: null,
			getTasksWidget(locals.db, locals.user.id, spaceIds, names),
			getRewardsWidget(locals.db, locals.user.id, spaceIds, names),
			// One row, for the Playroom card's "Last IQ test" line.
			latestIqTestResult(locals.db, locals.user.id),
			getHomeNotebookWidget(locals.db, locals.user.id)
		]
	);

	return {
		unread,
		guides: guidesCard,
		daydreams: daydreamsCard,
		tasks,
		rewards,
		latestIq,
		notebook
	};
};

async function loadGuidesCard(db: Db): Promise<GuidesWidgetView> {
	const [rows, total] = await Promise.all([
		// Same ordering as /home/guides, so the card previews the top of the list
		// the link goes to rather than an unrelated three. Limited in SQL, with
		// the total counted separately, because D1 charges for rows read and the
		// card never shows more than GUIDES_PREVIEW_LIMIT of them.
		db.query.guides.findMany({
			columns: { id: true, title: true },
			orderBy: (guide, { asc }) => [asc(guide.createdAt), asc(guide.id)],
			limit: GUIDES_PREVIEW_LIMIT
		}),
		db.$count(guides)
	]);
	return { guides: rows, total };
}
