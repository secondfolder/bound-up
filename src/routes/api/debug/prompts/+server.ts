import { error, json } from '@sveltejs/kit';
import type { Combo } from '$lib/prompt-review';
import { builderById } from '$lib/server/daydream/prompt-catalogue/axes';
import { paragraphsOf, textHash } from '$lib/server/daydream/prompt-catalogue/enumerate';
import {
	placeholderText,
	STARTER_IDS,
	starterText
} from '$lib/server/daydream/prompt-catalogue/fixtures';
import { lintPrompt } from '$lib/server/daydream/prompt-catalogue/lint';
import { promptText, renderPrompt } from '$lib/server/daydream/prompt-catalogue/render';
import { comboFromQuery } from '$lib/server/daydream/prompt-catalogue/snapshot';
import { requireFeature } from '$lib/server/features';
import type { RequestHandler } from './$types';

/** The most renders one request makes: one per value of a single axis. */
const MAX_SWEEP = 12;

/**
 * One prompt from the catalogue, rendered now, for the debug page's prompt
 * review (docs/prompt-review.md, "The debug page"): `builder` and the axis
 * values (`a.<axis>`), and which words to fill it with (`text`: placeholders
 * or a ready-made daydream's). With `sweep`, one per value of that axis
 * instead. A request renders a dozen prompts at most, so it stays well inside
 * a Worker's CPU budget; anything exhaustive comes from the committed
 * snapshot (`loadCatalogue`).
 *
 * The prompts are the server's own and the words placeholders or a ready-made
 * daydream's, so nothing a user wrote is read or returned. Behind debug mode's
 * feature, like everything it serves.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		error(401, 'Sign in to review prompts.');
	}
	await requireFeature(locals.db, locals.user.id, 'debugMode');

	const builder = builderById(url.searchParams.get('builder') ?? '');
	if (!builder) {
		error(400, 'Choose a prompt to review.');
	}
	const source = url.searchParams.get('text') ?? 'placeholders';
	const text = STARTER_IDS.includes(source) ? starterText(source) : placeholderText;
	const combo = comboFromQuery(builder, url.searchParams);

	const view = (variant: Combo) => {
		const result = renderPrompt(builder.id, variant, text);
		if (!result.ok) {
			return { combo: variant, ok: false as const, problem: result.problem };
		}
		return {
			combo: variant,
			ok: true as const,
			prompt: result.prompt,
			text: promptText(result.prompt),
			paragraphIds: paragraphsOf(result.prompt).map(({ text: paragraph }) => textHash(paragraph)),
			lint: lintPrompt(result.prompt)
		};
	};

	const sweep = url.searchParams.get('sweep');
	if (sweep !== null) {
		const axis = builder.axes.find((entry) => entry.id === sweep);
		if (!axis || axis.values.length > MAX_SWEEP) {
			error(400, 'That option cannot be swept.');
		}
		return json({
			variants: axis.values.map((value) => ({
				value: value.id,
				...view({ ...combo, [axis.id]: value.id })
			}))
		});
	}
	return json(view(combo));
};
