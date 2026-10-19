import { z } from 'zod';
import { env as privateEnv } from '$env/dynamic/private';
import type { PictureStyle } from '$lib/daydream';
import {
	type PictureArchitecture,
	type PictureModel,
	type PictureModels,
	pictureArchitecture
} from '$lib/daydream/image-prompt';

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
	RUNWARE_AI_IMAGE_MODEL?: string | undefined;
	RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED?: string | undefined;
};

export const DEFAULT_RUNWARE_BASE_URL = 'https://api.runware.ai/v1';

/**
 * The models when unset, as Runware hosts them, each pinned to a version so
 * an upload to the model page cannot change what the app draws. Runware's own
 * model search is where to look for others (`modelSearch`): it does not host
 * every Civitai version, and an AIR it does not host fails as an invalid
 * model.
 *
 * - Photo: Dark Beast 9, a Z-Image Turbo fine-tune for adult imagery
 *   (chosen 2026-10-20). Against the SDXL checkpoint it replaced, LUSTIFY!
 *   ENDGAME (`civitai:573152@1094291`), it follows a long description far
 *   more closely — who is where, how many people — and looks less waxy. It
 *   draws only photographs: asked for an illustration, it still made one.
 * - Illustrated: WAI-illustrious-SDXL v17.0, as a Runware user mirrored it;
 *   Civitai's own namespace on Runware does not have it.
 */
export const DEFAULT_PICTURE_MODELS: PictureModels = {
	photo: 'persona:242173@2788849',
	illustrated: 'aiki:827184@2883731'
};

/**
 * What every model above is, so the defaults never need asking. Any other AIR
 * is looked up once (`resolvePictureModel`).
 */
const KNOWN_ARCHITECTURES: ReadonlyMap<string, PictureArchitecture> = new Map([
	['persona:242173@2788849', 'z-image-turbo'],
	['civitai:573152@1094291', 'sdxl'],
	['aiki:827184@2883731', 'sdxl']
]);

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
			photo: values.RUNWARE_AI_IMAGE_MODEL?.trim() || DEFAULT_PICTURE_MODELS.photo,
			illustrated:
				values.RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED?.trim() || DEFAULT_PICTURE_MODELS.illustrated
		}
	};
}

/** This request's config: `platform.env` on Workers, the process environment everywhere else. */
export function readImageConfig(platform: App.Platform | undefined): ImageConfig | null {
	const read = (name: keyof ImageEnv) => platform?.env?.[name] ?? privateEnv[name];
	return parseImageConfig({
		RUNWARE_AI_API_KEY: read('RUNWARE_AI_API_KEY'),
		RUNWARE_BASE_URL: read('RUNWARE_BASE_URL'),
		RUNWARE_AI_IMAGE_MODEL: read('RUNWARE_AI_IMAGE_MODEL'),
		RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED: read('RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED')
	});
}

/**
 * Architectures already looked up, per model. A cache that outlives the
 * request on purpose: a model's architecture never changes, and this holds
 * no database, no binding and nothing about any user (invariant 2 is about
 * those), only what Runware says about a public model.
 */
const looked = new Map<string, PictureArchitecture>();

/** What Runware's `modelSearch` answers, as far as this reads it. */
const modelSearchSchema = z.object({
	data: z
		.array(z.object({ results: z.array(z.object({ air: z.string(), architecture: z.string() })) }))
		.min(1)
});

/**
 * Why a style's model cannot be used, said to whoever runs the server: the
 * variable to change, and what it has to be.
 */
export class PictureModelError extends Error {}

function variableFor(style: PictureStyle): keyof ImageEnv {
	return style === 'photo' ? 'RUNWARE_AI_IMAGE_MODEL' : 'RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED';
}

/**
 * A style's model with how it is prompted (`PictureArchitecture`). A default
 * is known; any other is asked of Runware's `modelSearch` the first time it
 * is used, which is one extra request per model per server process.
 *
 * Throws `PictureModelError` for a model Runware does not host or of a
 * family no recipe suits, rather than sending it a request built for
 * another kind of model, which would make a poor picture and say nothing.
 */
export async function resolvePictureModel(
	config: ImageConfig,
	style: PictureStyle,
	signal?: AbortSignal
): Promise<PictureModel> {
	const air = config.models[style];
	const known = KNOWN_ARCHITECTURES.get(air) ?? looked.get(air);
	if (known) {
		return { air, architecture: known };
	}
	const response = await fetch(config.baseUrl, {
		method: 'POST',
		headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
		body: JSON.stringify([
			{ taskType: 'modelSearch', taskUUID: crypto.randomUUID(), search: air, limit: 5 }
		]),
		...(signal ? { signal } : {})
	});
	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(`Runware's model search answered ${response.status}`);
	}
	const answer = modelSearchSchema.safeParse(await response.json().catch(() => null));
	const found = answer.success
		? answer.data.data[0]?.results.find((result) => result.air === air)
		: undefined;
	if (!found) {
		throw new PictureModelError(
			`${variableFor(style)} is "${air}", which Runware does not host. Find one with Runware's modelSearch, or unset it for the default.`
		);
	}
	const architecture = pictureArchitecture(found.architecture);
	if (!architecture) {
		throw new PictureModelError(
			`${variableFor(style)} is "${air}", a ${found.architecture} model. Pictures can use a Z-Image Turbo or an SDXL-family model (SDXL, Illustrious, Pony); choose one, or unset it for the default.`
		);
	}
	looked.set(air, architecture);
	return { air, architecture };
}
