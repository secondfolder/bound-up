import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * The kink list without an account. Someone signed in has their list in their
 * account, so they are sent there — to the same screen — rather than shown an
 * empty one on this device. A shared link is the exception: anyone may read
 * one, signed in or not.
 */
export const load: LayoutServerLoad = ({ locals, route }) => {
	if (!locals.user || route.id === '/(public)/kink-list/shared') {
		return {};
	}
	if (route.id === '/(public)/kink-list/quick') {
		redirect(303, '/playroom/kink-list/quick');
	}
	if (route.id === '/(public)/kink-list/transfer') {
		redirect(303, '/playroom/kink-list/transfer');
	}
	redirect(303, '/playroom/kink-list');
};
