import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	MODEL_SEARCH_LIMIT,
	type OpenRouterModelResult,
	shortDescription,
	splitOpenRouterModelId
} from '$lib/model-search';
import { requireAdmin } from '$lib/server/admin';
import { openrouterBaseUrl } from '$lib/server/daydream/config';
import type { RequestHandler } from './$types';

/** What OpenRouter's model list answers, as far as this reads it. */
const modelsSchema = z.object({
	data: z.array(
		z.object({
			id: z.string(),
			name: z.string().optional(),
			description: z.string().nullable().optional(),
			context_length: z.number().nullable().optional(),
			pricing: z
				.object({ prompt: z.string().optional(), completion: z.string().optional() })
				.optional()
		})
	)
});

const WHITESPACE = /\s+/;

/**
 * OpenRouter's catalogue, per isolate or process, for ten minutes. A cache
 * that outlives the request on purpose: it holds no binding and nothing about
 * any user (invariant 2 is about those), only OpenRouter's public list, and
 * every keystroke of a search would otherwise fetch the whole of it.
 */
const CATALOGUE_TTL_MS = 10 * 60_000;
let catalogue: { at: number; baseUrl: string; models: OpenRouterModelResult[] } | undefined;

function perMillion(price: string | undefined): number | null {
	const value = Number(price);
	return price === undefined || Number.isNaN(value) ? null : value * 1_000_000;
}

async function loadCatalogue(
	baseUrl: string,
	signal: AbortSignal
): Promise<OpenRouterModelResult[]> {
	if (catalogue && catalogue.baseUrl === baseUrl && Date.now() - catalogue.at < CATALOGUE_TTL_MS) {
		return catalogue.models;
	}
	let response: Response;
	try {
		// Public: the list needs no key, so a search works before one is saved.
		response = await fetch(`${baseUrl}/models`, { signal });
	} catch {
		error(502, 'OpenRouter could not be reached. Try again in a moment.');
	}
	const parsed = modelsSchema.safeParse(
		response.ok ? await response.json().catch(() => null) : null
	);
	if (!parsed.success) {
		await response.body?.cancel();
		error(502, 'OpenRouter did not send its list of models. Try again in a moment.');
	}
	const models = parsed.data.data.map((model) => ({
		openrouterModelId: model.id,
		name: model.name ?? model.id,
		description: shortDescription(model.description ?? ''),
		contextLength: model.context_length ?? null,
		promptPerMillion: perMillion(model.pricing?.prompt),
		completionPerMillion: perMillion(model.pricing?.completion)
	}));
	catalogue = { at: Date.now(), baseUrl, models };
	return models;
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
