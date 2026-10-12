import { json } from '@sveltejs/kit';
import {
	categoryCounts,
	filterHypnos,
	isHypnoCategory,
	pickRandom,
	triggerCounts
} from '$lib/playroom/iq-test/hypno';
import { createRng, newSeed } from '$lib/playroom/iq-test/random';
import { hypnoIndex } from '$lib/server/playroom-hypno';
import type { RequestHandler } from './$types';

/** The most results one search returns. */
const MAX_LIMIT = 50;

/**
 * Bambi hypnos for the IQ test: a search over bambicloud's playable files, or
 * one at random.
 *
 * Public, like the pictures endpoint: the test is reachable signed out, and
 * this is derived from bambicloud's public listing and nothing about the
 * visitor. Every input is a filter over an index this server built itself, so
 * nothing a visitor sends is passed on to bambicloud.
 *
 * `GET ?q=&categories=loop,subliminal&trigger=&maxMinutes=&random=1&exclude=&limit=`
 */
export const GET: RequestHandler = async ({ url, fetch }) => {
	const files = await hypnoIndex(fetch);
	const params = url.searchParams;
	const categories = (params.get('categories') ?? '')
		.split(',')
		.map((category) => category.trim())
		.filter(isHypnoCategory);
	const maxMinutes = Number(params.get('maxMinutes'));
	const matches = filterHypnos(files, {
		query: (params.get('q') ?? '').slice(0, 100),
		categories,
		trigger: params.get('trigger') ?? undefined,
		maxMinutes: Number.isFinite(maxMinutes) && maxMinutes > 0 ? maxMinutes : undefined
	});

	const facets = { triggers: triggerCounts(files), categories: categoryCounts(files) };

	if (params.get('random') === '1') {
		const pick = pickRandom(matches, createRng(newSeed()), params.get('exclude') ?? undefined);
		return json(
			{ files: pick ? [pick] : [], total: matches.length, ...facets },
			// Random is random: a cached answer would be the same "random" pick.
			{ headers: { 'cache-control': 'no-store' } }
		);
	}

	const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit')) || 20));
	return json(
		{ files: matches.slice(0, limit), total: matches.length, ...facets },
		{
			headers: {
				'cache-control': files.length > 0 ? 'public, max-age=300' : 'no-store'
			}
		}
	);
};
