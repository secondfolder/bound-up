import { describe, expect, it } from 'vitest';
import {
	OPENROUTER_MODEL_ID,
	openrouterModelIdFor,
	parseOpenRouterStoryModel,
	parseRunwarePictureModel,
	pictureBaseModelForRunware,
	RUNWARE_MODEL_AIR,
	runwarePictureModelFor,
	secretTail
} from './server-settings';

describe('model ids', () => {
	it('takes OpenRouter ids with a variant or an @ suffix, slashes and all', () => {
		for (const id of [
			'nousresearch/hermes-3-llama-3.1-70b',
			'deepseek/deepseek-chat:free',
			'z-ai/glm-5.2@preset/nsfw-compatible'
		]) {
			expect(OPENROUTER_MODEL_ID.test(id), id).toBe(true);
		}
		for (const id of ['hermes', 'a b/c', 'vendor/model@', '/model']) {
			expect(OPENROUTER_MODEL_ID.test(id), id).toBe(false);
		}
	});

	it('takes Runware AIRs whose version has letters in it', () => {
		for (const air of ['civitai:573152@1094291', 'persona:242173@2788849L', 'runware:100@1']) {
			expect(RUNWARE_MODEL_AIR.test(air), air).toBe(true);
		}
		for (const air of ['civitai:573152', 'civitai@1', 'a:b@']) {
			expect(RUNWARE_MODEL_AIR.test(air), air).toBe(false);
		}
	});
});

describe('stored choices', () => {
	it('sends a preset to its current id, and a custom choice as stored', () => {
		expect(openrouterModelIdFor(parseOpenRouterStoryModel('{"preset":"cydonia"}'))).toBe(
			'thedrummer/cydonia-24b-v4.1'
		);
		expect(
			openrouterModelIdFor(
				parseOpenRouterStoryModel('{"openrouterModelId":"z-ai/glm-5.2@preset/nsfw-compatible"}')
			)
		).toBe('z-ai/glm-5.2@preset/nsfw-compatible');
	});

	it('reads a choice it cannot understand as the default, rather than failing', () => {
		expect(parseOpenRouterStoryModel('{"preset":"gone"}')).toEqual({ preset: 'hermes' });
		expect(parseOpenRouterStoryModel('not json')).toEqual({ preset: 'hermes' });
		expect(parseRunwarePictureModel('photo', '{"runwareModelAir":"civitai:1@2"}')).toEqual({
			preset: 'dark-beast'
		});
	});

	it('prompts a picture model by the recipe its base model calls for', () => {
		expect(runwarePictureModelFor('photo', { preset: 'dark-beast' })).toMatchObject({
			architecture: 'z-image-turbo'
		});
		expect(
			runwarePictureModelFor('illustrated', { runwareModelAir: 'civitai:1@2', base: 'pony' })
		).toEqual({ runwareModelAir: 'civitai:1@2', base: 'pony', architecture: 'sdxl' });
	});

	it('suggests a base model for the architectures Runware reports', () => {
		expect(pictureBaseModelForRunware('z_image_turbo')).toBe('z-image-turbo');
		expect(pictureBaseModelForRunware('illustrious')).toBe('illustrious');
		expect(pictureBaseModelForRunware('flux1d')).toBeNull();
	});
});

describe('secretTail', () => {
	it('shows the end of a long credential, and nothing of a short one', () => {
		expect(secretTail('sk-or-v1-abcdefghijkl')).toBe('ijkl');
		expect(secretTail('short')).toBe('');
	});
});
