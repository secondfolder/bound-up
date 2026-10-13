import { error, json } from '@sveltejs/kit';
import { isVibe } from '$lib/playroom/iq-test/media';
import { pmvIndex, withMedia } from '$lib/server/playroom-pmv';
import { relayedFetch } from '$lib/server/porn-relay';
import { withTunnelFallback } from '$lib/server/porn-relay/tunnel';
import type { RequestHandler } from './$types';

/**
 * One PMVHaven video with its file, for a video chosen from the drawer whose
 * file a search page could not give (see `withMedia`).
 *
 * Only a video already in that vibe's index is looked up, so an id a visitor
 * makes up never becomes a request to PMVHaven: it is simply a 404.
 *
 * `GET /api/playroom/iq-test/pmvs/<id>?vibe=`
 */
export const GET: RequestHandler = async ({ params, url, fetch: eventFetch, platform }) => {
	// Through the relay on Workers, as in `../+server.ts`.
	const fetch = withTunnelFallback(platform, relayedFetch(platform, eventFetch));
	const vibe = url.searchParams.get('vibe');
	if (!isVibe(vibe)) {
		error(400, 'Unknown vibe');
	}
	const file = (await pmvIndex(vibe, fetch)).find((candidate) => candidate.uuid === params.id);
	const playable = file ? await withMedia(file, fetch) : null;
	if (!playable) {
		error(404, 'No such video');
	}
	return json(playable, { headers: { 'cache-control': 'public, max-age=3600' } });
};
