import { describe, expect, it } from 'vitest';
import { NOT_A_NUMBER, readNumberText } from './number-text';

describe('a number typed as text', () => {
	it('is a number, or none when empty', () => {
		expect(readNumberText(' 12 ')).toEqual({ value: 12, error: null });
		expect(readNumberText('4.5')).toEqual({ value: 4.5, error: null });
		expect(readNumberText('-3')).toEqual({ value: -3, error: null });
		expect(readNumberText('1,200')).toEqual({ value: 1200, error: null });
		expect(readNumberText('')).toEqual({ value: null, error: null });
	});

	it('is an error when it is not one', () => {
		for (const typed of ['twelve', '1e', '--', '12$', 'Infinity']) {
			expect(readNumberText(typed)).toEqual({ value: null, error: NOT_A_NUMBER });
		}
	});
});
