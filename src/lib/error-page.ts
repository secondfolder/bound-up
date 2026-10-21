/**
 * What an error page says for a status, in words a person can act on.
 *
 * SvelteKit's own error page is a bare status code and the thrown message, with
 * no way back but the browser's: every 403 and 404 in the app used to look like
 * that. The message a load or action throws is still shown under the heading,
 * since it is written for the person reading it ("Only the controlling side can
 * add tasks here."); this only supplies the heading and what to do next.
 */
export type ErrorCopy = { title: string; hint: string };

export function errorCopy(status: number): ErrorCopy {
	if (status === 401) {
		return { title: 'Sign in to see this', hint: 'This page is only for signed-in accounts.' };
	}
	if (status === 403) {
		return { title: 'Not for this account', hint: 'This page isn’t open to you.' };
	}
	if (status === 404) {
		return {
			title: 'Nothing here',
			hint: 'The page may have moved, or the link may be out of date.'
		};
	}
	if (status === 429) {
		return { title: 'Slow down a moment', hint: 'Too many tries in a short time. Wait a little.' };
	}
	return {
		title: 'Something went wrong',
		hint: 'It wasn’t anything you did. Trying again in a moment usually works.'
	};
}
