import { describe, expect, it, vi } from 'vitest';
import { OPENROUTER_STORY_MODEL_PRESETS } from '$lib/server-settings';
import { testSettings } from '$lib/testing/settings';
import { DEFAULT_OPENROUTER_BASE_URL, openrouterBaseUrl, parseDaydreamConfig } from './config';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

describe('parseDaydreamConfig', () => {
	it('is off without a key', () => {
		expect(parseDaydreamConfig(testSettings(), DEFAULT_OPENROUTER_BASE_URL)).toBeNull();
		expect(
			parseDaydreamConfig(testSettings({ openrouterApiKey: '  ' }), DEFAULT_OPENROUTER_BASE_URL)
		).toBeNull();
	});

	it('defaults the model to the first preset', () => {
		expect(
			parseDaydreamConfig(
				testSettings({ openrouterApiKey: 'sk-or-1' }),
				DEFAULT_OPENROUTER_BASE_URL
			)
		).toEqual({
			provider: 'openrouter',
			apiKey: 'sk-or-1',
			openrouterModelId: OPENROUTER_STORY_MODEL_PRESETS[0].openrouterModelId,
			readsLinks: false,
			researchModel: null,
			baseUrl: DEFAULT_OPENROUTER_BASE_URL
		});
	});

	it('sends a preset to its current model, and a custom choice as given', () => {
		const read = (storyModel: string) =>
			parseDaydreamConfig(
				testSettings({ openrouterApiKey: 'k', storyModel }),
				DEFAULT_OPENROUTER_BASE_URL
			)?.openrouterModelId;
		expect(read(JSON.stringify({ preset: 'euryale' }))).toBe('sao10k/l3.1-euryale-70b');
		expect(read(JSON.stringify({ openrouterModelId: 'some/model' }))).toBe('some/model');
	});

	it('reads links only with a model saved as calling tools', () => {
		const readsLinks = (storyModel: string) =>
			parseDaydreamConfig(
				testSettings({ openrouterApiKey: 'k', storyModel }),
				DEFAULT_OPENROUTER_BASE_URL
			)?.readsLinks;
		expect(readsLinks(JSON.stringify({ openrouterModelId: 'z-ai/glm-5.2', tools: true }))).toBe(
			true
		);
		expect(readsLinks(JSON.stringify({ openrouterModelId: 'z-ai/glm-5.2' }))).toBe(false);
		expect(readsLinks(JSON.stringify({ preset: 'hermes' }))).toBe(false);
	});

	it('researches with the research model only for a story model that cannot call tools', () => {
		const research = (storyModel: string, researchModel: string) =>
			parseDaydreamConfig(
				testSettings({ openrouterApiKey: 'k', storyModel, researchModel }),
				DEFAULT_OPENROUTER_BASE_URL
			)?.researchModel;
		const preset = JSON.stringify({ preset: 'hermes' });
		expect(research(preset, 'z-ai/glm-5.2')).toBe('z-ai/glm-5.2');
		expect(research(preset, '')).toBeNull();
		expect(research(preset, 'not an id')).toBeNull();
		expect(
			research(JSON.stringify({ openrouterModelId: 'z-ai/glm-5.2', tools: true }), 'other/model')
		).toBeNull();
	});
});

describe('openrouterBaseUrl', () => {
	it('defaults to OpenRouter, and takes the test seam without its trailing slash', () => {
		env.OPENROUTER_BASE_URL = undefined;
		expect(openrouterBaseUrl(undefined)).toBe(DEFAULT_OPENROUTER_BASE_URL);
		env.OPENROUTER_BASE_URL = 'http://127.0.0.1:9999/v1/';
		expect(openrouterBaseUrl(undefined)).toBe('http://127.0.0.1:9999/v1');
	});

	it('refuses one that is not http(s), naming the fix', () => {
		env.OPENROUTER_BASE_URL = 'openrouter.ai';
		expect(() => openrouterBaseUrl(undefined)).toThrow(/Unset it to use OpenRouter itself/);
	});
});
