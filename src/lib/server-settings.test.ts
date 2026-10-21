import { describe, expect, it } from 'vitest';
import {
	IMAGE_PROVIDERS,
	LANGUAGE_PROVIDERS,
	MODEL_PROVIDER_IDS,
	MODEL_PROVIDERS,
	modelKindsOf,
	OPENROUTER_MODEL_ID,
	openrouterModelIdFor,
	parsePictureModel,
	parseStoryModel,
	pictureBaseModelForRunware,
	providerCredential,
	RUNWARE_MODEL_AIR,
	runwarePictureModelFor,
	SECRET_SETTING_KEYS,
	secretTail,
	storyModelCallsTools
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
		expect(openrouterModelIdFor(parseStoryModel('{"preset":"cydonia"}'))).toBe(
			'thedrummer/cydonia-24b-v4.1'
		);
		expect(
			openrouterModelIdFor(
				parseStoryModel('{"openrouterModelId":"z-ai/glm-5.2@preset/nsfw-compatible"}')
			)
		).toBe('z-ai/glm-5.2@preset/nsfw-compatible');
	});

	it('calls tools only for a custom model saved as able to', () => {
		const glm = '{"openrouterModelId":"z-ai/glm-5.2@preset/nsfw-compatible"';
		expect(storyModelCallsTools(parseStoryModel(`${glm},"tools":true}`))).toBe(true);
		// Saved before tools were asked about, or with something odd in their place.
		expect(storyModelCallsTools(parseStoryModel(`${glm}}`))).toBe(false);
		expect(storyModelCallsTools(parseStoryModel(`${glm},"tools":"yes"}`))).toBe(false);
		expect(storyModelCallsTools(parseStoryModel('{"preset":"hermes","tools":true}'))).toBe(false);
	});

	it('reads a choice it cannot understand as the default, rather than failing', () => {
		const hermes = { provider: 'openrouter', preset: 'hermes' };
		expect(parseStoryModel('{"preset":"gone"}')).toEqual(hermes);
		expect(parseStoryModel('not json')).toEqual(hermes);
		expect(parsePictureModel('photo', '{"runwareModelAir":"civitai:1@2"}')).toEqual({
			provider: 'runware',
			preset: 'dark-beast'
		});
	});

	it('reads the provider a choice names, and one with none as the only provider', () => {
		expect(parseStoryModel('{"provider":"openrouter","preset":"euryale"}')).toEqual({
			provider: 'openrouter',
			preset: 'euryale'
		});
		// Stored before there was a choice of provider.
		expect(parseStoryModel('{"preset":"euryale"}')).toEqual({
			provider: 'openrouter',
			preset: 'euryale'
		});
		expect(
			parsePictureModel('illustrated', '{"runwareModelAir":"civitai:1@2","base":"pony"}')
		).toEqual({ provider: 'runware', runwareModelAir: 'civitai:1@2', base: 'pony' });
	});

	it('reads a choice from a provider it does not know as the default', () => {
		expect(parseStoryModel('{"provider":"elsewhere","preset":"euryale"}')).toEqual({
			provider: 'openrouter',
			preset: 'hermes'
		});
		// A provider of the other kind is as unknown as one that does not exist.
		expect(parseStoryModel('{"provider":"runware","openrouterModelId":"a/b"}')).toEqual({
			provider: 'openrouter',
			preset: 'hermes'
		});
		expect(parsePictureModel('photo', '{"provider":"openrouter","preset":"lustify"}')).toEqual({
			provider: 'runware',
			preset: 'dark-beast'
		});
	});

	it('prompts a picture model by the recipe its base model calls for', () => {
		expect(
			runwarePictureModelFor('photo', { provider: 'runware', preset: 'flux-2-klein-9b' })
		).toEqual({
			runwareModelAir: 'runware:400@2',
			base: 'flux-2-klein',
			architecture: 'flux-2'
		});
		expect(
			runwarePictureModelFor('photo', { provider: 'runware', preset: 'dark-beast' })
		).toMatchObject({
			architecture: 'z-image-turbo'
		});
		expect(
			runwarePictureModelFor('illustrated', {
				provider: 'runware',
				runwareModelAir: 'civitai:1@2',
				base: 'pony'
			})
		).toEqual({ runwareModelAir: 'civitai:1@2', base: 'pony', architecture: 'sdxl' });
	});

	it('suggests a base model for the architectures Runware reports', () => {
		expect(pictureBaseModelForRunware('z_image_turbo')).toBe('z-image-turbo');
		expect(pictureBaseModelForRunware('illustrious')).toBe('illustrious');
		expect(pictureBaseModelForRunware('flux1d')).toBeNull();
		expect(pictureBaseModelForRunware('flux2klein_9b')).toBe('flux-2-klein');
		expect(pictureBaseModelForRunware('flux2klein_4b')).toBe('flux-2-klein');
		// Undistilled: it wants ~28 steps, not the recipe's 4.
		expect(pictureBaseModelForRunware('flux2klein_base_9b')).toBeNull();
	});
});

describe('model providers', () => {
	it('keeps each provider’s key as a credential, never sent to the browser', () => {
		for (const id of MODEL_PROVIDER_IDS) {
			expect(SECRET_SETTING_KEYS.has(MODEL_PROVIDERS[id].credentialKey), id).toBe(true);
		}
	});

	it('lists every provider of a kind as one that runs it', () => {
		for (const id of LANGUAGE_PROVIDERS) {
			expect(modelKindsOf(id)).toContain('language');
		}
		for (const id of IMAGE_PROVIDERS) {
			expect(modelKindsOf(id)).toContain('image');
		}
		expect(modelKindsOf('openrouter')).toEqual(['language']);
	});

	it('reads a provider’s key from its own setting, trimmed', () => {
		const settings = { openrouterApiKey: ' sk-or-1 ', runwareApiKey: '' };
		expect(providerCredential(settings, 'openrouter')).toBe('sk-or-1');
		expect(providerCredential(settings, 'runware')).toBe('');
	});
});

describe('secretTail', () => {
	it('shows the end of a long credential, and nothing of a short one', () => {
		expect(secretTail('sk-or-v1-abcdefghijkl')).toBe('ijkl');
		expect(secretTail('short')).toBe('');
	});
});
