import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	// Someone already signed in has not lost their way in. Sending them on
	// rather than showing a flow that would replace their keys is the safe
	// default — the page would otherwise let a signed-in session start one.
	if (locals.user) {
		redirect(303, '/home');
	}
	return {};
};
