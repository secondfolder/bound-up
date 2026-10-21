import { error } from '@sveltejs/kit';
import { BUILDERS, builderById } from '$lib/server/daydream/prompt-catalogue/axes';
import { STARTER_IDS } from '$lib/server/daydream/prompt-catalogue/fixtures';
import { loadCatalogue } from '$lib/server/daydream/prompt-catalogue/snapshot';
import { requireFeature } from '$lib/server/features';
import type { PageServerLoad } from './$types';

/**
 * The prompt review page (docs/prompt-review.md, "The debug page"): the
 * builders and their axes, and the opened builder's generated catalogue.
 * Single prompts are rendered on demand by /api/debug/prompts.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		error(401, 'Sign in to review prompts.');
	}
	await requireFeature(locals.db, locals.user.id, 'debugMode');
	const builder = builderById(url.searchParams.get('builder') ?? '') ?? BUILDERS[0];
	if (!builder) {
		error(500, 'There are no prompt builders to review: see prompt-catalogue/axes.ts.');
	}
	const catalogue = await loadCatalogue(builder.id);
	if (!catalogue) {
		error(
			404,
			`No catalogue for "${builder.id}" in this build. It is generated, not committed: run \`npm run prompts:export\` in a checkout and open this page from its dev server.`
		);
	}
	return {
		builders: BUILDERS.map(({ id, label, description }) => ({ id, label, description })),
		builder,
		starters: STARTER_IDS,
		catalogue
	};
};
