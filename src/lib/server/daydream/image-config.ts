import { env as privateEnv } from '$env/dynamic/private';
import type { PictureModels } from '$lib/daydream/image-prompt';

/**
 * Where a daydream's pictures are made, read from the server's environment.
 * See docs/daydreams.md, "Pictures".
 *
 * Optional, like Daydreams themselves (`readDaydreamConfig`): a server
 * without a Runware key has no pictures, the story model is not asked to
 * describe any, and nothing else changes.
 */
export type ImageConfig = {
	apiKey: string;
	/** Runware's API root. Only the e2e suite points it anywhere else. */
	baseUrl: string;
	/** A Runware model AIR for each style. */
	models: PictureModels;
};

export type ImageEnv = {
	RUNWARE_AI_API_KEY?: string | undefined;
	RUNWARE_BASE_URL?: string | undefined;
	DAYDREAM_IMAGE_MODEL_PHOTO?: string | undefined;
	DAYDREAM_IMAGE_MODEL_ILLUSTRATED?: string | undefined;
};

export const DEFAULT_RUNWARE_BASE_URL = 'https://api.runware.ai/v1';

/**
 * The models when unset: SDXL checkpoints tuned for adult imagery, as
 * Runware hosts them, each pinned to a version so an upload to the model page
 * cannot change what the app draws. Both were tried against Runware when
 * chosen (2026-10-20), and Runware's own model search is where to look for
 * others (`modelSearch`): it does not host every Civitai version, and an AIR
 * it does not host fails as an invalid model.
 *
 * - Photo: LUSTIFY! ENDGAME, the newest SDXL build under Runware's own
 *   Civitai namespace. (Lustify v10 is built on Krea, not SDXL.)
 * - Illustrated: WAI-illustrious-SDXL v17.0, as a Runware user mirrored it;
 *   Civitai's own namespace on Runware does not have it.
 */
export const DEFAULT_PICTURE_MODELS: PictureModels = {
	photo: 'civitai:573152@1094291',
	illustrated: 'aiki:827184@2883731'
};

const TRAILING_SLASHES = /\/+$/;
const HTTP_URL = /^https?:\/\//;

/** Null when no key is set, which turns pictures off on this server. */
export function parseImageConfig(values: ImageEnv): ImageConfig | null {
	const apiKey = values.RUNWARE_AI_API_KEY?.trim();
	if (!apiKey) {
		return null;
	}
	const baseUrl = (values.RUNWARE_BASE_URL?.trim() || DEFAULT_RUNWARE_BASE_URL).replace(
		TRAILING_SLASHES,
		''
	);
	if (!HTTP_URL.test(baseUrl)) {
		throw new Error(
			`RUNWARE_BASE_URL must be an http(s) URL, such as ${DEFAULT_RUNWARE_BASE_URL}; it is "${baseUrl}". Unset it to use Runware itself.`
		);
	}
	return {
		apiKey,
		baseUrl,
		models: {
			photo: values.DAYDREAM_IMAGE_MODEL_PHOTO?.trim() || DEFAULT_PICTURE_MODELS.photo,
			illustrated:
				values.DAYDREAM_IMAGE_MODEL_ILLUSTRATED?.trim() || DEFAULT_PICTURE_MODELS.illustrated
		}
	};
}

/** This request's config: `platform.env` on Workers, the process environment everywhere else. */
export function readImageConfig(platform: App.Platform | undefined): ImageConfig | null {
	const read = (name: keyof ImageEnv) => platform?.env?.[name] ?? privateEnv[name];
	return parseImageConfig({
		RUNWARE_AI_API_KEY: read('RUNWARE_AI_API_KEY'),
		RUNWARE_BASE_URL: read('RUNWARE_BASE_URL'),
		DAYDREAM_IMAGE_MODEL_PHOTO: read('DAYDREAM_IMAGE_MODEL_PHOTO'),
		DAYDREAM_IMAGE_MODEL_ILLUSTRATED: read('DAYDREAM_IMAGE_MODEL_ILLUSTRATED')
	});
}
