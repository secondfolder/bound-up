import { describe, expect, it } from 'vitest';
import { assertStorageKey, voiceSampleKey } from './index';

describe('voiceSampleKey', () => {
	it('is a safe key for any Fish id', async () => {
		const key = await voiceSampleKey('../a b/c?', 's2.1-pro', 'Hello.');
		expect(() => assertStorageKey(key)).not.toThrow();
		expect(key).toMatch(/^permanent\/voice-samples\/[0-9a-f]{64}$/);
	});

	it('is the same for the same voice, model and line', async () => {
		expect(await voiceSampleKey('v', 'm', 'Hello.')).toBe(await voiceSampleKey('v', 'm', 'Hello.'));
	});

	it('changes with the voice, the model or the line', async () => {
		const key = await voiceSampleKey('v', 'm', 'Hello.');
		expect(await voiceSampleKey('w', 'm', 'Hello.')).not.toBe(key);
		expect(await voiceSampleKey('v', 'n', 'Hello.')).not.toBe(key);
		expect(await voiceSampleKey('v', 'm', 'Hi.')).not.toBe(key);
	});
});
