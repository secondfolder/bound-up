import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { MODEL_SEARCH_LIMIT, type RunwareModelResult } from '$lib/model-search';
import { requireAdmin } from '$lib/server/admin';
import { runwareBaseUrl } from '$lib/server/daydream/image-config';
import { pictureBaseModelForRunware, providerCredential } from '$lib/server-settings';
import type { RequestHandler } from './$types';

/** What Runware's `modelSearch` answers, as far as this reads it. */
const modelSearchSchema = z.object({
	data: z
		.array(
			z.object({
				results: z.array(
					z.object({
						air: z.string(),
						name: z.string().optional(),
						version: z.string().optional(),
						architecture: z.string().nullable().optional(),
						shortDescription: z.string().nullable().optional(),
						comment: z.string().nullable().optional(),
						tags: z.array(z.string()).nullable().optional(),
						defaultSteps: z.number().nullable().optional(),
						defaultCFG: z.number().nullable().optional(),
						positiveTriggerWords: z.string().nullable().optional()
					})
				)
			})
		)
		.min(1)
});

const TAGS = /<[^>]*>/g;
const WHITESPACE = /\s+/g;
const SPACE_BEFORE_PUNCTUATION = /\s+(?<mark>[.,;:!?])/g;
/** As much of a description as the picker shows. */
const DESCRIPTION_LIMIT = 600;

/**
 * A model page's description as plain text, cut short. Authors write HTML
 * there (it comes from Civitai), and the picker renders text, never markup.
 */
function plainText(html: string | null | undefined): string {
	// A tag becomes a space, so two paragraphs do not run together, and then
	// the space an inline tag left before a full stop goes again.
	const text = (html ?? '')
		.replace(TAGS, ' ')
		.replace(WHITESPACE, ' ')
		.replace(SPACE_BEFORE_PUNCTUATION, '$<mark>')
		.trim();
	return text.length > DESCRIPTION_LIMIT ? `${text.slice(0, DESCRIPTION_LIMIT - 1)}…` : text;
}

/**
 * Searches the checkpoints Runware hosts, for the picture model pickers on
 * Admin → Server settings. Unlike OpenRouter's list this needs a key, so it
 * uses the one saved: a search before one is saved is answered 409, saying so.
 *
 * Only what Runware hosts can be drawn with — it does not have every Civitai
 * version, and an AIR it does not host fails as an invalid model — which is
 * why the picker searches here rather than on Civitai.
 *
 * `?air=` instead of `?q=` looks up one model exactly, for an AIR typed or
 * pasted into the picker rather than found by searching: the answer is that
 * model or nothing, which says whether Runware hosts it.
 */
export const GET: RequestHandler = async ({ locals, platform, request, url }) => {
	requireAdmin(locals);
	const apiKey = providerCredential(locals.settings, 'runware');
	if (!apiKey) {
		return json(
			{
				message: 'Save a Runware API key under Model providers first: searching Runware needs one.'
			},
			{ status: 409 }
		);
	}
	const air = url.searchParams.get('air')?.trim() ?? '';
	const search = (air || (url.searchParams.get('q') ?? '')).trim().slice(0, 100);
	let response: Response;
	try {
		response = await fetch(runwareBaseUrl(platform), {
			method: 'POST',
			headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify([
				{
					taskType: 'modelSearch',
					taskUUID: crypto.randomUUID(),
					search,
					category: 'checkpoint',
					limit: MODEL_SEARCH_LIMIT
				}
			]),
			signal: request.signal
		});
	} catch {
		error(502, 'Runware could not be reached. Try again in a moment.');
	}
	if (response.status === 401 || response.status === 403) {
		await response.body?.cancel();
		return json(
			{ message: 'Runware refused the saved API key. Check it, and save it again.' },
			{ status: 409 }
		);
	}
	const parsed = modelSearchSchema.safeParse(
		response.ok ? await response.json().catch(() => null) : null
	);
	if (!parsed.success) {
		await response.body?.cancel();
		error(502, 'Runware did not answer the search. Try again in a moment.');
	}
	const results: RunwareModelResult[] = (parsed.data.data[0]?.results ?? [])
		.filter((model) => !air || model.air === air)
		.map((model) => ({
			runwareModelAir: model.air,
			name: model.name ?? model.air,
			version: model.version ?? '',
			architecture: model.architecture ?? '',
			base: pictureBaseModelForRunware(model.architecture ?? ''),
			description: plainText(model.shortDescription || model.comment),
			tags: (model.tags ?? []).slice(0, 12),
			defaultSteps: model.defaultSteps ?? null,
			defaultCfg: model.defaultCFG ?? null,
			triggerWords: model.positiveTriggerWords?.trim() ?? ''
		}));
	return json({ results });
};
