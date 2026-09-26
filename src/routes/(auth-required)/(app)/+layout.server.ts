import type { FeatureKey } from '$lib/features';
import { isAdmin } from '$lib/server/admin';
import { listUserFeatures } from '$lib/server/features';
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
		return {
			partners: [],
			helpRequests: [] as HelpRequestView[],
			features: [] as FeatureKey[],
			isAdmin: false
		};
	}

	const [partners, helpFrom, features] = await Promise.all([
		listPartnersForNav(locals.db, locals.user.id),
		// On every screen, because a partner who cannot sign in cannot message
		// you to say so. The query this replaced — "has this user any message
		// history?" — decided when to show an unlock callout, which is gone.
		listHelpRequests(locals.db, locals.user.id),
		// For display only: which cards and links to show. Loads run in
		// parallel, so a page cannot rely on this having run first, and a form
		// action runs before any load at all — every page and action that serves
		// a feature checks with `requireFeature` itself.
		listUserFeatures(locals.db, locals.user.id)
	]);

	// Names from the nav's own list rather than a second query, so the two can
	// never call the same partner different things.
	const helpRequests: HelpRequestView[] = partners
		.filter((partner) => helpFrom.includes(partner.id))
		.map((partner) => ({ partnershipId: partner.id, partnerName: partner.name }));

	return {
		partners,
		helpRequests,
		features,
		// A boolean rather than the role, so page data carries only the answer
		// the UI needs. The admin pages check the role again on the server.
		isAdmin: isAdmin(locals.user)
	};
};
