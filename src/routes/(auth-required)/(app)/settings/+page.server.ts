import { error } from '@sveltejs/kit';
import { appVersion } from '$lib/server/app-version';
import { setDebugCookie } from '$lib/server/debug';
import { requireFeature } from '$lib/server/features';
import type { Actions, PageServerLoad } from './$types';

// From the server rather than read from `__APP_VERSION__` in the page: the
// Docker image only learns its version at runtime. See $lib/server/app-version.
export const load: PageServerLoad = () => ({ appVersion: appVersion() });

export const actions: Actions = {
	/**
	 * Switches debug mode on or off for this device (docs/debug-mode.md). Both
	 * the switch on this page and the bottom nav's corner button post here.
	 *
	 * Not a superform: it carries one boolean, with nothing to validate and no
	 * field to show an error beside, like the logout form on the same page.
	 * The feature is checked here because an action runs before any load, so
	 * the switch being hidden gates nothing.
	 */
	debug: async ({ locals, request, cookies }) => {
		if (!locals.user) {
			error(401, 'Sign in to change debug mode.');
		}
		await requireFeature(locals.db, locals.user.id, 'debugMode');
		const on = (await request.formData()).get('on') === 'true';
		setDebugCookie(cookies, on);
		return { debug: on };
	}
};
