import { error } from '@sveltejs/kit';
import { getPartnerMessagesWidget } from '$lib/server/messaging';
import { getPartnershipForUser } from '$lib/server/partnerships';
import { getPartnershipRewardsWidget } from '$lib/server/rewards';
import { getPartnershipTasksWidget } from '$lib/server/tasks';
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
	depends('tasks:home');
	depends('rewards:home');

	// Each widget re-checks membership for itself rather than being handed the
	// partnership above: tasks and rewards each resolve a *different* permission
	// from it (who completes, who claims), and those checks live with the rules
	// they enforce. Three single-row reads is the price of not re-deriving
	// either rule here.
	const [messages, tasks, rewards] = await Promise.all([
		getPartnerMessagesWidget(locals.db, params.id, locals.user.id),
		getPartnershipTasksWidget(locals.db, params.id, locals.user.id, locals.user.timezone),
		getPartnershipRewardsWidget(locals.db, params.id, locals.user.id)
	]);

	// `inviteToken` is deliberately not returned: load data is serialised into
	// the page HTML, and an accepted partnership has no live token anyway.
	return {
		messages,
		tasks,
		rewards,
		partner: {
			id: partnership.id,
			name: partnership.partnerName,
			yourName: partnership.yourName,
			image: partnership.counterpart?.image ?? null,
			timezone: partnership.counterpart?.timezone ?? null,
			partnerRole: partnership.partnerRole,
			yourRole: partnership.yourRole,
			canEdit: partnership.canEdit
		}
	};
};
