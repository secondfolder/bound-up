import { error } from '@sveltejs/kit';
import { requireFeature } from '$lib/server/features';
import type { PageServerLoad } from './$types';

/** Debug tools (docs/debug-mode.md, "Debug tools"): behind the feature, like everything debug mode serves. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Sign in to use debug tools.');
	}
	await requireFeature(locals.db, locals.user.id, 'debugMode');
	return {};
};
