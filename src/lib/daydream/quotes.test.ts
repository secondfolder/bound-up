import { describe, expect, it } from 'vitest';
import { quoteAt, quoteRanges } from './quotes';

const text = 'She waits. You hold still. Nothing moves.';
const quote = (start: number, end: number) => ({ start, end, text: text.slice(start, end) });

describe('quoteRanges', () => {
	it('gives each quoted stretch', () => {
		expect(quoteRanges(text, [quote(11, 26)])).toEqual([[11, 26]]);
	});

	it('merges overlapping quotes, in any order', () => {
		expect(quoteRanges(text, [quote(15, 26), quote(11, 20), quote(0, 3)])).toEqual([
			[0, 3],
			[11, 26]
		]);
	});

	it('ignores a quote whose offsets no longer match its words', () => {
		expect(quoteRanges(text, [{ start: 0, end: 3, text: 'You' }])).toEqual([]);
	});

	it('is empty with no quotes', () => {
		expect(quoteRanges(text, [])).toEqual([]);
	});
});

describe('quoteAt', () => {
	it('trims whitespace off a sloppy selection', () => {
		expect(quoteAt(text, 10, 27)).toEqual({ start: 11, end: 26, text: 'You hold still.' });
	});

	it('takes the offsets either way round', () => {
		expect(quoteAt(text, 26, 11)?.text).toBe('You hold still.');
	});

	it('is null for a selection with no words', () => {
		expect(quoteAt(text, 10, 11)).toBeNull();
		expect(quoteAt(text, 5, 5)).toBeNull();
	});
});
