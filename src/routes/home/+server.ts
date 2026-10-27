import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * LEGACY-SPACES: `/home` was the signed-in app until the Dashboard became
 * Today, at `/today`. Nothing in the app links here any more; this is kept
 * only for home-screen installs. iOS keeps the `start_url` a web app was
 * added to the Home Screen with and never refetches the manifest, so every
 * launch of an install from before the move opens `/home`, and without this
 * it would be a 404 that reloading cannot fix. See docs/temporary-code.md,
 * "The /home redirect".
 *
 * A 307, never a 308: a browser keeps a permanent redirect for ever, and
 * this one is meant to go away. Nothing else under `/home` survives (the
 * old card routes simply 404), and a `+server.ts` rather than a page, so it
 * runs no layout loads and answers before the sign-in guard, which then
 * sees `/today` as the place to come back to.
 */
export const GET: RequestHandler = ({ url }) => {
	redirect(307, `/today${url.search}`);
};
