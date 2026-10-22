import { describe, expect, it } from 'vitest';
import { creditsLabel } from './credits';

describe('creditsLabel', () => {
	it('pluralises everything but one', () => {
		expect(creditsLabel(0)).toBe('0 credits');
		expect(creditsLabel(1)).toBe('1 credit');
		expect(creditsLabel(8)).toBe('8 credits');
	});
});
