import { listHelpRequests } from '$lib/server/messaging';
import { listPartnersForNav } from '$lib/server/partnerships';
import type { HelpRequestView } from '$lib/types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Loaded in the layout rather than per page because the bottom nav renders
	// one tab per partner on every screen in this group. The group's own guard
	// has already run by the time a layout load does, so `locals.user` is set —
	// but this narrows for TypeScript and degrades to an empty nav rather than
	// throwing if that ever stops being true.
	if (!locals.user) {
		return { partners: [], helpRequests: [] as HelpRequestView[] };
	}

	const [partners, helpFrom] = await Promise.all([
		listPartnersForNav(locals.db, locals.user.id),
		// On every screen, because a partner who cannot sign in cannot message
		// you to say so. The query this replaced — "has this user any message
		// history?" — decided when to show an unlock callout, which is gone.
		listHelpRequests(locals.db, locals.user.id)
	]);

	// Names from the nav's own list rather than a second query, so the two can
	// never call the same partner different things.
	const helpRequests: HelpRequestView[] = partners
		.filter((partner) => helpFrom.includes(partner.id))
		.map((partner) => ({ partnershipId: partner.id, partnerName: partner.name }));

	return { partners, helpRequests };
};
