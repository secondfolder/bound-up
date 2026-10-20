import { env as privateEnv } from '$env/dynamic/private';
import {
	openrouterModelIdFor,
	parseOpenRouterStoryModel,
	type ServerSettings,
	storyModelCallsTools
} from '$lib/server-settings';

/**
 * Where a daydream's replies are written, from the server's settings
 * (Admin → Server settings). See docs/daydreams.md.
 *
 * Optional, like push (`readVapidConfig`) and unlike mail: a server without a
 * key simply has no Daydreams, and its pages say so.
 */
export type DaydreamConfig = {
	apiKey: string;
	/** The OpenRouter model the story goes to, e.g. `nousresearch/hermes-3-llama-3.1-70b`. */
	openrouterModelId: string;
	/**
	 * Whether the model calls tools, so a brief's links can be read with
	 * OpenRouter's `web_fetch` (docs/daydreams.md, "Links in a brief").
	 */
	readsLinks: boolean;
	/** OpenRouter's API root. Only the e2e suite points it anywhere else. */
	baseUrl: string;
};

export type DaydreamSettings = Pick<ServerSettings, 'openrouterApiKey' | 'openrouterStoryModel'>;

export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const TRAILING_SLASHES = /\/+$/;
const HTTP_URL = /^https?:\/\//;

/**
 * OpenRouter's API root: `OPENROUTER_BASE_URL` if set, which only the e2e
 * suite does, to reach its stand-in (`e2e/model-stub.mjs`). An environment
 * variable rather than a setting because it is a test seam, not something an
 * admin chooses.
 */
export function openrouterBaseUrl(platform: App.Platform | undefined): string {
	const given = platform?.env?.OPENROUTER_BASE_URL ?? privateEnv.OPENROUTER_BASE_URL;
	const baseUrl = (given?.trim() || DEFAULT_OPENROUTER_BASE_URL).replace(TRAILING_SLASHES, '');
	if (!HTTP_URL.test(baseUrl)) {
		throw new Error(
			`OPENROUTER_BASE_URL must be an http(s) URL, such as ${DEFAULT_OPENROUTER_BASE_URL}; it is "${baseUrl}". Unset it to use OpenRouter itself.`
		);
	}
	return baseUrl;
}

/** Null when no key is set, which turns Daydreams off on this server. */
export function parseDaydreamConfig(
	settings: DaydreamSettings,
	baseUrl: string
): DaydreamConfig | null {
	const apiKey = settings.openrouterApiKey.trim();
	if (!apiKey) {
		return null;
	}
	const choice = parseOpenRouterStoryModel(settings.openrouterStoryModel);
	return {
		apiKey,
		openrouterModelId: openrouterModelIdFor(choice),
		readsLinks: storyModelCallsTools(choice),
		baseUrl
	};
}

/** This request's config, from `locals.settings`. */
export function readDaydreamConfig(
	settings: DaydreamSettings,
	platform: App.Platform | undefined
): DaydreamConfig | null {
	return parseDaydreamConfig(settings, openrouterBaseUrl(platform));
}
