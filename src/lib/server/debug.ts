import type { Cookies } from '@sveltejs/kit';
import { DEBUG_COOKIE, DEBUG_COOKIE_ON } from '../debug';
import type { Db } from './db';
import { userHasFeature } from './features';

/**
 * Debug mode on the server. See docs/debug-mode.md.
 *
 * Only ever decides what is *shown*. Anything debug mode reveals that the
 * server has to serve checks `requireFeature(…, 'debugMode')` itself, as the
 * Daydreams prompt endpoint does.
 */

/** For a page outside the app shell, which has no `features` list to hand. */
export async function readDebugMode(db: Db, userId: string, cookies: Cookies): Promise<boolean> {
	if (cookies.get(DEBUG_COOKIE) !== DEBUG_COOKIE_ON) {
		return false;
	}
	return await userHasFeature(db, userId, 'debugMode');
}

/** A year: it is a per-device preference, not a session, so it outlives one. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function setDebugCookie(cookies: Cookies, on: boolean): void {
	if (on) {
		// httpOnly because nothing in the browser reads it: the server hands
		// the answer down as `page.data.debug`.
		cookies.set(DEBUG_COOKIE, DEBUG_COOKIE_ON, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: MAX_AGE_SECONDS
		});
	} else {
		cookies.delete(DEBUG_COOKIE, { path: '/' });
	}
}
