import { ALL_CONTEXT, type AppContext, CONTEXT_DEPENDENCY } from '$lib/context';
import { DEBUG_COOKIE, debugModeOn } from '$lib/debug';
import type { FeatureKey } from '$lib/features';
import { isAdmin } from '$lib/server/admin';
import { contextSpaceViews } from '$lib/server/context';
import { listUserFeatures } from '$lib/server/features';
import { listHelpRequests } from '$lib/server/messaging';
import { listPartnersForNav } from '$lib/server/partnerships';
import { readVapidConfig } from '$lib/server/push';
import type { ContextSpaceView, HelpRequestView } from '$lib/types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies, depends }) => {
	// The switcher's current context comes from here, so switching re-runs this
	// along with the page's own loads. See docs/contexts.md.
	depends(CONTEXT_DEPENDENCY);

	// Loaded in the layout rather than per page because every screen in this
	// group needs the partners: the context switcher's names, the help
	// callout, and Today's and the boards' per-partner rows. The group's own
	// guard has already run by the time a layout load does, so `locals.user`
	// is set — but this narrows for TypeScript and degrades to an empty shell
	// rather than throwing if that ever stops being true.
	if (!locals.user) {
		return {
			partners: [],
			helpRequests: [] as HelpRequestView[],
			features: [] as FeatureKey[],
			isAdmin: false,
			pushAvailable: false,
			debug: false,
			contextSpaces: [] as ContextSpaceView[],
			context: ALL_CONTEXT as AppContext
		};
	}

	const [partners, helpFrom, features, spaces, context] = await Promise.all([
		listPartnersForNav(locals.db, locals.user.id),
		// On every screen, because a partner who cannot sign in cannot message
		// you to say so. The query this replaced — "has this user any message
		// history?" — decided when to show an unlock callout, which is gone.
		listHelpRequests(locals.db, locals.user.id),
		// For display only: which cards and links to show. Loads run in
		// parallel, so a page cannot rely on this having run first, and a form
		// action runs before any load at all — every page and action that serves
		// a feature checks with `requireFeature` itself.
		listUserFeatures(locals.db, locals.user.id),
		// The spaces the context switcher offers, and the one the cookie names.
		// Display only, like `features`: no action reads either to decide where
		// a write goes (docs/contexts.md, "Writes name their space").
		locals.contextSpaces(),
		locals.context()
	]);

	// Names from the nav's own list rather than a second query, so the two can
	// never call the same partner different things.
	const helpRequests: HelpRequestView[] = partners
		.filter((partner) => helpFrom.includes(partner.id))
		.map((partner) => ({ partnershipId: partner.id, names: partner.names }));

	return {
		partners,
		helpRequests,
		features,
		// A boolean rather than the role, so page data carries only the answer
		// the UI needs. The admin pages check the role again on the server.
		isAdmin: isAdmin(locals.user),
		// Whether this server has push keys at all, so the shell only suggests
		// turning on notifications where they can work. Env, not a query.
		pushAvailable: readVapidConfig(locals.settings) !== null,
		// This device's debug switch, honoured only while the account holds
		// the feature. Display only, like `features`. See docs/debug-mode.md.
		debug: debugModeOn(features, cookies.get(DEBUG_COOKIE)),
		contextSpaces: contextSpaceViews(spaces, partners),
		context
	};
};
