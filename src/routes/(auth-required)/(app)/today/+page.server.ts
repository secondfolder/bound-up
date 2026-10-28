import { error } from '@sveltejs/kit';
import { CONTEXT_DEPENDENCY } from '$lib/context';
import { hasFeature } from '$lib/features';
import type { Db } from '$lib/server/db';
import { guides } from '$lib/server/db/schema';
import { latestIqTestResult } from '$lib/server/iq-test';
import { getPartnerMessagesWidget, listUnreadCounts } from '$lib/server/messaging';
import { getHomeNotebookWidget, getPartnershipNotebookWidget } from '$lib/server/notebook';
import { getPartnershipForUser } from '$lib/server/partnerships';
import { getRewardsWidget, rewardsDependency } from '$lib/server/rewards';
import { getTasksWidget, tasksDependency } from '$lib/server/tasks';
import type { GuidesWidgetView } from '$lib/types';
import type { PageServerLoad } from './$types';

/** Rows the guides card previews before it falls back to "and N more". */
const GUIDES_PREVIEW_LIMIT = 3;

/**
 * Today: the signed-in app's front page, which follows the context
 * (docs/section-widgets.md, docs/contexts.md). Everyone is every space's
 * overview, Me is your own cards with nothing of a partner's, and a
 * partnership is that partnership's place: its header and its cards.
 *
 * Each card is built by the same server function the old /home and partner
 * pages used, and each re-checks membership for itself; the context only
 * decides which cards are asked for. It is a view filter, never a write
 * target, and nothing here writes.
 */
export const load: PageServerLoad = async ({ locals, parent, depends }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const { user } = locals;
	depends(CONTEXT_DEPENDENCY);

	// The app shell's layout has already loaded the partner list (for their
	// names, resolved in exactly one place: invariant 12) and the features, so
	// they are taken from there rather than read a second time.
	const [{ partners, features }, context, spaces] = await Promise.all([
		parent(),
		locals.context(),
		locals.contextSpaces()
	]);

	// Only for an account that holds the feature: D1 charges for rows read by
	// a card nobody sees. This decides what is shown, which is all the
	// layout's `features` may be used for; /guides checks for itself.
	const guidesCard = () => (hasFeature(features, 'guides') ? loadGuidesCard(locals.db) : null);

	const space =
		context.kind === 'space'
			? spaces.find((candidate) => candidate.spaceId === context.spaceId)
			: null;

	if (space?.kind === 'shared') {
		const partnership = await getPartnershipForUser(locals.db, space.spaceId, user.id);
		// The context resolver offers only accepted partnerships, so this holds;
		// one that ended between the two reads shows Everyone below instead.
		if (partnership?.status === 'accepted') {
			const { id } = partnership;
			// The same keys the features' own pages use, so completing a task,
			// claiming a reward or reading a thread refreshes the cards here too.
			depends('messages:unread', `messages:board:${id}`, `notebook:${id}`);
			depends(tasksDependency(id), rewardsDependency(id));
			// One space, so its balance needs no label.
			const noNames = new Map<string, never>();
			const [messages, tasks, rewards, notebook] = await Promise.all([
				getPartnerMessagesWidget(locals.db, id, user.id),
				getTasksWidget(locals.db, user.id, [id], noNames),
				getRewardsWidget(locals.db, user.id, [id], noNames),
				getPartnershipNotebookWidget(locals.db, id, user.id)
			]);
			return {
				context,
				today: {
					kind: 'shared' as const,
					// `inviteToken` is deliberately not returned: load data is
					// serialised into the page HTML.
					partner: {
						id,
						names: partnership.names,
						timezone: partnership.counterpart?.timezone ?? null,
						canEdit: partnership.canEdit
					},
					messages,
					tasks,
					rewards,
					notebook: notebook ?? []
				}
			};
		}
	}

	if (space?.kind === 'solo') {
		const id = space.spaceId;
		depends('notebook:self', tasksDependency(id), rewardsDependency(id));
		const noNames = new Map<string, never>();
		const [tasks, rewards, notebook, latestIq, guidesView] = await Promise.all([
			getTasksWidget(locals.db, user.id, [id], noNames),
			getRewardsWidget(locals.db, user.id, [id], noNames),
			getHomeNotebookWidget(locals.db, user.id),
			// One row, for the Playroom card's "Last IQ test" line.
			latestIqTestResult(locals.db, user.id),
			guidesCard()
		]);
		return {
			context,
			today: {
				kind: 'solo' as const,
				spaceId: id,
				tasks,
				rewards,
				notebook,
				latestIq,
				guides: guidesView
			}
		};
	}

	// Everyone. The tasks and rewards cards cover every space the viewer is
	// in, which is what /tasks and /rewards show in Everyone.
	const spaceIds = spaces.map((candidate) => candidate.spaceId);
	const names = new Map(partners.map((partner) => [partner.id, partner.names]));
	depends('messages:unread', 'notebook:self');
	for (const spaceId of spaceIds) {
		depends(tasksDependency(spaceId), rewardsDependency(spaceId));
	}
	const [unread, guidesView, tasks, rewards, latestIq, notebook] = await Promise.all([
		listUnreadCounts(locals.db, user.id, partners),
		guidesCard(),
		getTasksWidget(locals.db, user.id, spaceIds, names),
		getRewardsWidget(locals.db, user.id, spaceIds, names),
		latestIqTestResult(locals.db, user.id),
		getHomeNotebookWidget(locals.db, user.id)
	]);
	return {
		// Everyone, also when a cookie named a partnership that ended between
		// the context's read and the partnership's.
		context: { kind: 'all' as const },
		today: {
			kind: 'all' as const,
			soloSpaceId: spaces.find((candidate) => candidate.kind === 'solo')?.spaceId ?? null,
			unread,
			guides: guidesView,
			tasks,
			rewards,
			latestIq,
			notebook
		}
	};
};

async function loadGuidesCard(db: Db): Promise<GuidesWidgetView> {
	const [rows, total] = await Promise.all([
		// Same ordering as /guides, so the card previews the top of the list the
		// link goes to rather than an unrelated three. Limited in SQL, with the
		// total counted separately, because D1 charges for rows read and the
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
