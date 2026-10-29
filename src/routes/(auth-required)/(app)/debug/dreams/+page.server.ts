import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { dev } from '$app/environment';
import { cryptoRandom } from '$lib/dream/random';
import { abVoteForm } from '$lib/schemas/abVoteForm';
import { requireFeature } from '$lib/server/features';
import type { Actions, PageServerLoad } from './$types';

/**
 * Blind A/B voting between two prompt versions' bench runs, and the
 * leaderboard the votes make (docs/dreams.md, "Quality tools").
 *
 * Development only: it reads and writes dream-bench/ on the developer's
 * machine, which no deployed server has. The module that does is imported
 * behind `dev`, so it never reaches a build.
 */
const BENCH_ROOT = 'dream-bench';

async function guard(locals: App.Locals): Promise<void> {
	if (!locals.user) {
		error(401, 'Sign in to vote on bench runs.');
	}
	await requireFeature(locals.db, locals.user.id, 'debugMode');
	if (!dev) {
		error(
			404,
			'Bench voting works only on a dev server: it reads dream-bench/, written by `npm run dreams:bench` in a checkout.'
		);
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	await guard(locals);
	const ab = await import('$lib/server/dream/ab');
	const { bradleyTerry } = await import('$lib/server/dream/bench/leaderboard');
	const versions = await ab.listVersions(BENCH_ROOT);
	const labels = versions.map((version) => version.label);
	const a = versions.find((version) => version.label === url.searchParams.get('a')) ?? versions[1];
	const b = versions.find((version) => version.label === url.searchParams.get('b')) ?? versions[0];
	const votes = await ab.readVotes(BENCH_ROOT);
	const pair = a && b && a !== b ? await ab.randomPair(BENCH_ROOT, a, b, cryptoRandom) : null;
	const form = await superValidate({ pair: pair?.pairId ?? '' }, zod4(abVoteForm), {
		errors: false
	});
	return {
		labels,
		a: a?.label ?? null,
		b: b?.label ?? null,
		pair: pair && { brief: pair.brief, left: pair.left, right: pair.right },
		form,
		standings: bradleyTerry(votes),
		voteCount: votes.length
	};
};

export const actions: Actions = {
	default: async ({ locals, request, url }) => {
		await guard(locals);
		const form = await superValidate(request, zod4(abVoteForm));
		if (!form.valid) {
			return fail(400, { form });
		}
		const ab = await import('$lib/server/dream/ab');
		const tags = ab.VOTE_TAGS.filter((tag) => form.data[tag]);
		await ab.recordVote(BENCH_ROOT, form.data.pair, form.data.choice, tags);
		// Straight on to the next pair.
		redirect(303, `${url.pathname}${url.search}`);
	}
};
