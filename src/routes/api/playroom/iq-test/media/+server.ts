import { json } from '@sveltejs/kit';
import { hasMedia, isVibe } from '$lib/playroom/iq-test/media';
import { mediaFor } from '$lib/server/playroom-media';
import type { RequestHandler } from './$types';

/**
 * Pictures for the IQ test's intensities 3 and 4.
 *
 * Public, unlike `/api/oembed`: the test is reachable signed out, and what
 * this returns is derived from public Redgifs searches and subreddit feeds,
 * and nothing about the visitor. It is not an open proxy because the only
 * input is a vibe, and the sources each vibe maps to are a fixed list in
 * `media.ts`.
 *
 * The browser loads the images and players straight from Redgifs and reddit;
 * only the lookups come through here — Redgifs' search needs a token, and
 * reddit's feeds send no CORS headers.
 */
export const GET: RequestHandler = async ({ url, fetch }) => {
	const vibe = url.searchParams.get('vibe');
	if (!isVibe(vibe)) {
		return json({ error: 'unknown vibe' }, { status: 400 });
	}
	const feed = await mediaFor(vibe, fetch);
	return json(feed, {
		// Public data, the same for everyone: let the browser and any shared
		// cache hold it as long as the server-side cache would. An empty feed is
		// never cached: it means every source is backing off, and the page asks
		// again in a little while, which a cached empty answer would defeat.
		headers: { 'cache-control': hasMedia(feed) ? 'public, max-age=3600' : 'no-store' }
	});
};
