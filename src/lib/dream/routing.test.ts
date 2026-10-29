import { describe, expect, it } from 'vitest';
import { ADULT_LEVELS } from '../model-providers';
import { REQUIRED_LEVEL } from './routing';

describe('REQUIRED_LEVEL', () => {
	it('is the highest level a provider is checked at: full adult support', () => {
		expect(REQUIRED_LEVEL).toBe(4);
		expect(ADULT_LEVELS.at(-1)?.level).toBe(REQUIRED_LEVEL);
	});
});
