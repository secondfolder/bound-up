/**
 * What the admin screen's model searches answer, shared by the endpoints
 * (`/api/admin/models/*`) and the picker that reads them. See
 * docs/server-settings.md, "Choosing a model".
 *
 * Alias-free and pure.
 */

import type { PictureBaseModel } from './server-settings';

/** One OpenRouter model, as a search result. Prices are US dollars per million tokens. */
export type OpenRouterModelResult = {
	openrouterModelId: string;
	name: string;
	/** OpenRouter's description, whitespace collapsed and cut short; `''` without one. */
	description: string;
	contextLength: number | null;
	promptPerMillion: number | null;
	completionPerMillion: number | null;
};

/**
 * An OpenRouter model id as its list knows it, and what follows an `@`.
 *
 * `z-ai/glm-5.2@preset/nsfw-compatible` is listed as `z-ai/glm-5.2`; the
 * suffix only says how the request is routed (here, through one of the
 * account's provider presets), so looking a model up goes by the first part.
 */
export function splitOpenRouterModelId(id: string): { listed: string; suffix: string } {
	const at = id.indexOf('@');
	return at === -1
		? { listed: id, suffix: '' }
		: { listed: id.slice(0, at), suffix: id.slice(at + 1) };
}

/** One Runware checkpoint, as a search result. */
export type RunwareModelResult = {
	runwareModelAir: string;
	name: string;
	version: string;
	/** What Runware calls its architecture, as it said it. */
	architecture: string;
	/** Our base model for it, when one suits; the picker fills the base model in with it. */
	base: PictureBaseModel | null;
	/** What its page says it is, as plain text and cut short; `''` without one. */
	description: string;
	tags: string[];
	/** The settings its author recommends, which hint at what it is: ~8 steps and CFG 1 is a distilled model. */
	defaultSteps: number | null;
	defaultCfg: number | null;
	/** Words its author says to include, `''` without any. */
	triggerWords: string;
};

export type ModelSearchAnswer<Result> = { results: Result[] } | { message: string };

/** As much of a description as the picker shows. */
export const MODEL_DESCRIPTION_LIMIT = 600;

/** Collapses whitespace and cuts a description to `MODEL_DESCRIPTION_LIMIT`. */
export function shortDescription(text: string): string {
	const collapsed = text.replace(/\s+/g, ' ').trim();
	return collapsed.length > MODEL_DESCRIPTION_LIMIT
		? `${collapsed.slice(0, MODEL_DESCRIPTION_LIMIT - 1)}…`
		: collapsed;
}

/** The most results a search shows: enough to scan, few enough to read. */
export const MODEL_SEARCH_LIMIT = 20;
