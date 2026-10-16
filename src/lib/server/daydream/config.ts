import { env as privateEnv } from '$env/dynamic/private';

/**
 * Where a daydream's replies are written, read from the server's environment.
 * See docs/daydreams.md.
 *
 * Optional, like push (`readVapidConfig`) and unlike mail: a server without a
 * key simply has no Daydreams, and its pages say so. Making it a startup
 * failure would stop every self-hosted instance that does not want the
 * feature from starting.
 */
export type DaydreamConfig = {
	apiKey: string;
	/** An OpenRouter model id, e.g. `nousresearch/hermes-3-llama-3.1-70b`. */
	model: string;
	/** OpenRouter's API root. Only the e2e suite points it anywhere else. */
	baseUrl: string;
};

export type DaydreamEnv = {
	OPENROUTER_API_KEY?: string | undefined;
	DAYDREAM_MODEL?: string | undefined;
	OPENROUTER_BASE_URL?: string | undefined;
};

/**
 * The model when `DAYDREAM_MODEL` is unset: an open-weights model whose terms,
 * and whose providers' terms on OpenRouter, allow adult fiction. Most hosted
 * models' do not, which is why the choice is not left to OpenRouter.
 */
export const DEFAULT_DAYDREAM_MODEL = 'nousresearch/hermes-3-llama-3.1-70b';

export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const TRAILING_SLASHES = /\/+$/;
const HTTP_URL = /^https?:\/\//;

/** Null when no key is set, which turns Daydreams off on this server. */
export function parseDaydreamConfig(values: DaydreamEnv): DaydreamConfig | null {
	const apiKey = values.OPENROUTER_API_KEY?.trim();
	if (!apiKey) {
		return null;
	}
	const baseUrl = (values.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL).replace(
		TRAILING_SLASHES,
		''
	);
	if (!HTTP_URL.test(baseUrl)) {
		throw new Error(
			`OPENROUTER_BASE_URL must be an http(s) URL, such as ${DEFAULT_OPENROUTER_BASE_URL}; it is "${baseUrl}". Unset it to use OpenRouter itself.`
		);
	}
	return {
		apiKey,
		model: values.DAYDREAM_MODEL?.trim() || DEFAULT_DAYDREAM_MODEL,
		baseUrl
	};
}

/**
 * This request's config: `platform.env` on Workers, the process environment
 * everywhere else, like every other secret here.
 */
export function readDaydreamConfig(platform: App.Platform | undefined): DaydreamConfig | null {
	const read = (name: keyof DaydreamEnv) => platform?.env?.[name] ?? privateEnv[name];
	return parseDaydreamConfig({
		OPENROUTER_API_KEY: read('OPENROUTER_API_KEY'),
		DAYDREAM_MODEL: read('DAYDREAM_MODEL'),
		OPENROUTER_BASE_URL: read('OPENROUTER_BASE_URL')
	});
}
