import { error } from '@sveltejs/kit';
import { getPartnerMessagesWidget } from '$lib/server/messaging';
import { getPartnershipNotebookWidget } from '$lib/server/notebook';
import { getPartnershipForUser } from '$lib/server/partnerships';
import { getRewardsWidget, rewardsDependency } from '$lib/server/rewards';
import { getTasksWidget, tasksDependency } from '$lib/server/tasks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const partnership = await getPartnershipForUser(locals.db, params.id, locals.user.id);
	// A pending invite has no partner behind it yet, so it gets no partner page
	// — the nav does not link to one either. 404 rather than 403 for a
	// partnership belonging to someone else: distinguishing them would confirm
	// the id is real.
	if (partnership?.status !== 'accepted') {
		error(404, 'Partner not found');
	}

	// The same keys the sections' own pages use, so completing a task, claiming
	// a reward or reading a thread refreshes the cards here too.
	depends('messages:unread');
	depends(`messages:board:${params.id}`);
	depends(tasksDependency(params.id), rewardsDependency(params.id));
	depends(`notebook:${params.id}`);

	// Each widget re-checks membership for itself rather than being handed the
	// partnership above: the checks live with the rules they enforce. The task
	// and reward cards cover this partnership's space alone, which is what
	// their links open the lists in.
	const noNames = new Map<string, never>();
	const [messages, tasks, rewards, notebook] = await Promise.all([
		getPartnerMessagesWidget(locals.db, params.id, locals.user.id),
		getTasksWidget(locals.db, locals.user.id, [params.id], noNames),
		getRewardsWidget(locals.db, locals.user.id, [params.id], noNames),
		getPartnershipNotebookWidget(locals.db, params.id, locals.user.id)
	]);

	// `inviteToken` is deliberately not returned: load data is serialised into
	// the page HTML, and an accepted partnership has no live token anyway.
	return {
		messages,
		tasks,
		rewards,
		notebook: notebook ?? [],
		partner: {
			id: partnership.id,
			names: partnership.names,
			image: partnership.counterpart?.image ?? null,
			timezone: partnership.counterpart?.timezone ?? null,
			canEdit: partnership.canEdit
		}
	};
};
