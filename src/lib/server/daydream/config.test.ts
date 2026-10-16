import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DAYDREAM_MODEL, DEFAULT_OPENROUTER_BASE_URL, parseDaydreamConfig } from './config';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

describe('parseDaydreamConfig', () => {
	it('is off without a key', () => {
		expect(parseDaydreamConfig({})).toBeNull();
		expect(parseDaydreamConfig({ OPENROUTER_API_KEY: '  ', DAYDREAM_MODEL: 'x' })).toBeNull();
	});

	it('defaults the model and the base URL', () => {
		expect(parseDaydreamConfig({ OPENROUTER_API_KEY: 'sk-or-1' })).toEqual({
			apiKey: 'sk-or-1',
			model: DEFAULT_DAYDREAM_MODEL,
			baseUrl: DEFAULT_OPENROUTER_BASE_URL
		});
	});

	it('takes a model and a base URL, without its trailing slash', () => {
		expect(
			parseDaydreamConfig({
				OPENROUTER_API_KEY: 'sk-or-1',
				DAYDREAM_MODEL: 'some/model',
				OPENROUTER_BASE_URL: 'http://127.0.0.1:9999/v1/'
			})
		).toMatchObject({ model: 'some/model', baseUrl: 'http://127.0.0.1:9999/v1' });
	});

	it('refuses a base URL that is not http(s), naming the fix', () => {
		expect(() =>
			parseDaydreamConfig({ OPENROUTER_API_KEY: 'k', OPENROUTER_BASE_URL: 'openrouter.ai' })
		).toThrow(/Unset it to use OpenRouter itself/);
	});
});
