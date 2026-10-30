import { describe, expect, it } from 'vitest';
import { DEFAULT_READING_OPTIONS, readReadingOptions } from './reading-options';

describe('readReadingOptions', () => {
	it('is the defaults with nothing stored', () => {
		expect(readReadingOptions(null)).toEqual(DEFAULT_READING_OPTIONS);
		expect(readReadingOptions('on')).toEqual(DEFAULT_READING_OPTIONS);
	});

	it('keeps what was stored', () => {
		const stored = { listening: true, readNew: true, highlight: false, keepGoing: true, rate: 1.5 };
		expect(readReadingOptions(stored)).toEqual(stored);
	});

	it('drops only the options that are the wrong shape', () => {
		expect(readReadingOptions({ listening: 'yes', keepGoing: true, rate: 7 })).toEqual({
			...DEFAULT_READING_OPTIONS,
			keepGoing: true
		});
	});
});
