import { readImageConfig } from '$lib/server/daydream/image-config';
import { KEEPS_PLAYGROUND_HISTORY, requirePlayground } from '$lib/server/image-playground';
import {
	PICTURE_BASE_MODELS,
	providerCredential,
	RUNWARE_PICTURE_MODEL_PRESETS
} from '$lib/server-settings';
import type { PageServerLoad } from './$types';

/**
 * The picture playground (docs/debug-mode.md, "Picture playground"): the
 * models it offers to start with, which are the presets and whatever this
 * server draws daydreams with. Its history comes from /api/debug/images.
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	await requirePlayground(locals);
	const architectureOf = (base: string) =>
		PICTURE_BASE_MODELS.find((entry) => entry.id === base)?.architecture ?? 'sdxl';
	const presets = Object.values(RUNWARE_PICTURE_MODEL_PRESETS)
		.flat()
		.map((preset) => ({
			runwareModelAir: preset.runwareModelAir,
			label: preset.label,
			architecture: architectureOf(preset.base)
		}));
	const config = readImageConfig(locals.settings, platform);
	const inUse = config
		? (['photo', 'illustrated'] as const).map((style) => ({
				style,
				runwareModelAir: config.models[style].runwareModelAir,
				architecture: config.models[style].architecture
			}))
		: [];
	return {
		presets,
		inUse,
		hasKey: Boolean(providerCredential(locals.settings, 'runware')),
		kept: KEEPS_PLAYGROUND_HISTORY
	};
};
