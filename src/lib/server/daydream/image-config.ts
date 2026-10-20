import { env as privateEnv } from '$env/dynamic/private';
import type { PictureStyle } from '$lib/daydream';
import type { PictureArchitecture } from '$lib/daydream/image-prompt';
import {
	parseRunwarePictureModel,
	RUNWARE_PICTURE_MODEL_SETTING,
	type RunwarePictureModel,
	runwarePictureModelFor,
	type ServerSettings
} from '$lib/server-settings';

/**
 * Where a daydream's pictures are made, from the server's settings
 * (Admin → Server settings). See docs/daydreams.md, "Pictures".
 *
 * Optional, like Daydreams themselves (`readDaydreamConfig`): a server
 * without a Runware key has no pictures, the story model is not asked to
 * describe any, and nothing else changes.
 */
export type ImageConfig = {
	apiKey: string;
	/** Runware's API root. Only the e2e suite points it anywhere else. */
	baseUrl: string;
	/** Each style's model, with the base model that decides how it is prompted. */
	models: Readonly<Record<PictureStyle, RunwarePictureModel>>;
};

export type ImageSettings = Pick<
	ServerSettings,
	'runwareApiKey' | (typeof RUNWARE_PICTURE_MODEL_SETTING)[PictureStyle]
>;

export const DEFAULT_RUNWARE_BASE_URL = 'https://api.runware.ai/v1';

const TRAILING_SLASHES = /\/+$/;
const HTTP_URL = /^https?:\/\//;

/**
 * Runware's API root: `RUNWARE_BASE_URL` if set, which only the e2e suite
 * does. A test seam, like `OPENROUTER_BASE_URL`, not a setting.
 */
export function runwareBaseUrl(platform: App.Platform | undefined): string {
	const given = platform?.env?.RUNWARE_BASE_URL ?? privateEnv.RUNWARE_BASE_URL;
	const baseUrl = (given?.trim() || DEFAULT_RUNWARE_BASE_URL).replace(TRAILING_SLASHES, '');
	if (!HTTP_URL.test(baseUrl)) {
		throw new Error(
			`RUNWARE_BASE_URL must be an http(s) URL, such as ${DEFAULT_RUNWARE_BASE_URL}; it is "${baseUrl}". Unset it to use Runware itself.`
		);
	}
	return baseUrl;
}

/**
 * Null when no key is set, which turns pictures off on this server.
 *
 * Each model's base model is part of the setting, chosen with it, rather than
 * asked of Runware when it is first used: a model Runware misreports, or one
 * of a family no recipe suits, is then the admin's choice to make knowingly,
 * not a failed picture.
 */
export function parseImageConfig(settings: ImageSettings, baseUrl: string): ImageConfig | null {
	const apiKey = settings.runwareApiKey.trim();
	if (!apiKey) {
		return null;
	}
	const model = (style: PictureStyle) =>
		runwarePictureModelFor(
			style,
			parseRunwarePictureModel(style, settings[RUNWARE_PICTURE_MODEL_SETTING[style]])
		);
	return { apiKey, baseUrl, models: { photo: model('photo'), illustrated: model('illustrated') } };
}

/** This request's config, from `locals.settings`. */
export function readImageConfig(
	settings: ImageSettings,
	platform: App.Platform | undefined
): ImageConfig | null {
	return parseImageConfig(settings, runwareBaseUrl(platform));
}

/**
 * How the story model is told to describe a picture for a daydream in this
 * style: the recipe of the model that draws it, or null on a server that
 * makes no pictures, where it is not asked for one at all.
 */
export function pictureArchitectureFor(
	config: ImageConfig | null,
	style: PictureStyle
): PictureArchitecture | null {
	return config?.models[style].architecture ?? null;
}
