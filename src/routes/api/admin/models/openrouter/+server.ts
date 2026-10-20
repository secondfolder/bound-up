import { error, json } from '@sveltejs/kit';
import {
	MODEL_SEARCH_LIMIT,
	type OpenRouterModelResult,
	splitOpenRouterModelId
} from '$lib/model-search';
import { requireAdmin } from '$lib/server/admin';
import { openrouterBaseUrl } from '$lib/server/daydream/config';
import { loadOpenRouterCatalogue, OpenRouterCatalogueError } from '$lib/server/openrouter-models';
import type { RequestHandler } from './$types';

const WHITESPACE = /\s+/;

async function loadCatalogue(
	baseUrl: string,
	signal: AbortSignal
): Promise<OpenRouterModelResult[]> {
	try {
		return await loadOpenRouterCatalogue(baseUrl, signal);
	} catch (cause) {
		if (cause instanceof OpenRouterCatalogueError) {
			error(502, cause.message);
		}
		throw cause;
	}
}

/**
 * Searches OpenRouter's models for the story model picker on Admin → Server
 * settings: every word of `q` has to appear in a model's id or name.
 *
 * `?id=` instead looks one model up exactly, for an id typed, pasted or saved
 * before, so the picker can say what it is — or that OpenRouter does not list
 * it. An `@` suffix is ignored for that (`splitOpenRouterModelId`).
 */
export const GET: RequestHandler = async ({ locals, platform, request, url }) => {
	requireAdmin(locals);
	const id = url.searchParams.get('id')?.trim();
	if (id) {
		const { listed } = splitOpenRouterModelId(id);
		const models = await loadCatalogue(openrouterBaseUrl(platform), request.signal);
		return json({ results: models.filter((model) => model.openrouterModelId === listed) });
	}
	const words = (url.searchParams.get('q') ?? '').toLowerCase().split(WHITESPACE).filter(Boolean);
	const models = await loadCatalogue(openrouterBaseUrl(platform), request.signal);
	const results = models
		.filter((model) => {
			const haystack = `${model.openrouterModelId} ${model.name}`.toLowerCase();
			return words.every((word) => haystack.includes(word));
		})
		.slice(0, MODEL_SEARCH_LIMIT);
	return json({ results });
};
