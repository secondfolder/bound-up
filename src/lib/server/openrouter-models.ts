import { z } from 'zod';
import { type OpenRouterModelResult, shortDescription } from '$lib/model-search';

/**
 * OpenRouter's catalogue of models, for the admin screen's model search
 * (`/api/admin/models/openrouter`) and for saving a story model, which asks
 * it whether the model calls tools. See docs/server-settings.md, "Choosing a
 * model".
 */

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
				.optional(),
			supported_parameters: z.array(z.string()).nullable().optional()
		})
	)
});

/** Why the catalogue could not be had, in words fit to show an admin. */
export class OpenRouterCatalogueError extends Error {}

/**
 * The catalogue, per isolate or process, for ten minutes. A cache that
 * outlives the request on purpose: it holds no binding and nothing about any
 * user (invariant 2 is about those), only OpenRouter's public list, and every
 * keystroke of a search would otherwise fetch the whole of it.
 */
const CATALOGUE_TTL_MS = 10 * 60_000;
let catalogue: { at: number; baseUrl: string; models: OpenRouterModelResult[] } | undefined;

function perMillion(price: string | undefined): number | null {
	const value = Number(price);
	return price === undefined || Number.isNaN(value) ? null : value * 1_000_000;
}

/** Every model OpenRouter lists. Throws `OpenRouterCatalogueError` when it cannot say. */
export async function loadOpenRouterCatalogue(
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
	} catch (cause) {
		throw new OpenRouterCatalogueError('OpenRouter could not be reached. Try again in a moment.', {
			cause
		});
	}
	const parsed = modelsSchema.safeParse(
		response.ok ? await response.json().catch(() => null) : null
	);
	if (!parsed.success) {
		await response.body?.cancel();
		throw new OpenRouterCatalogueError(
			'OpenRouter did not send its list of models. Try again in a moment.'
		);
	}
	const models = parsed.data.data.map((model) => ({
		openrouterModelId: model.id,
		name: model.name ?? model.id,
		description: shortDescription(model.description ?? ''),
		contextLength: model.context_length ?? null,
		promptPerMillion: perMillion(model.pricing?.prompt),
		completionPerMillion: perMillion(model.pricing?.completion),
		tools: model.supported_parameters?.includes('tools') ?? false
	}));
	catalogue = { at: Date.now(), baseUrl, models };
	return models;
}
