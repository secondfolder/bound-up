import { error, json } from '@sveltejs/kit';
import { filterHypnos, type HypnoFile, triggerCounts } from '$lib/playroom/iq-test/hypno';
import { isVibe } from '$lib/playroom/iq-test/media';
import { pickPmv } from '$lib/playroom/iq-test/pmv';
import { pmvIndex, withMedia } from '$lib/server/playroom-pmv';
import type { RequestHandler } from './$types';

/** The most results one search returns. */
const MAX_LIMIT = 50;

/** Picks tried before giving up on a random one whose file cannot be found. */
const RANDOM_ATTEMPTS = 3;

/**
 * PMVHaven hypnos for a vibe: a search over that vibe's index, or one at
 * random. The same answer shape as `/hypnos`, so the drawer and the session
 * treat the two sources alike; it has no categories, and its "triggers" are
 * PMVHaven's tags.
 *
 * Public, and not an open proxy: the vibe picks one of the fixed searches in
 * `PMV_QUERIES`, and everything else filters what those found.
 *
 * `GET ?vibe=&q=&trigger=&maxMinutes=&random=1&exclude=&limit=`
 */
export const GET: RequestHandler = async ({ url, fetch }) => {
	const params = url.searchParams;
	const vibe = params.get('vibe');
	if (!isVibe(vibe)) {
		error(400, 'Unknown vibe');
	}
	const files = await pmvIndex(vibe, fetch);
	const maxMinutes = Number(params.get('maxMinutes'));
	const matches = filterHypnos(files, {
		query: (params.get('q') ?? '').slice(0, 100),
		trigger: params.get('trigger') ?? undefined,
		maxMinutes: Number.isFinite(maxMinutes) && maxMinutes > 0 ? maxMinutes : undefined
	});
	const facets = { triggers: triggerCounts(files), categories: [] };

	if (params.get('random') === '1') {
		let pool = matches;
		let pick: HypnoFile | null = null;
		for (let attempt = 0; attempt < RANDOM_ATTEMPTS && pick === null; attempt += 1) {
			const candidate = pickPmv(pool, Math.random, params.get('exclude') ?? undefined);
			if (candidate === null) {
				break;
			}
			pick = await withMedia(candidate, fetch);
			pool = pool.filter((file) => file.uuid !== candidate.uuid);
		}
		return json(
			{ files: pick ? [pick] : [], total: matches.length, ...facets },
			{ headers: { 'cache-control': 'no-store' } }
		);
	}

	const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit')) || 20));
	return json(
		{ files: matches.slice(0, limit), total: matches.length, ...facets },
		{ headers: { 'cache-control': files.length > 0 ? 'public, max-age=300' : 'no-store' } }
	);
};
