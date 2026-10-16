import { describe, expect, it } from 'vitest';
import { highlightSegments, quoteAt } from './quotes';

const text = 'She waits. You hold still. Nothing moves.';
const quote = (start: number, end: number) => ({ start, end, text: text.slice(start, end) });

describe('highlightSegments', () => {
	it('marks each quoted stretch', () => {
		expect(highlightSegments(text, [quote(11, 26)])).toEqual([
			{ text: 'She waits. ', marked: false },
			{ text: 'You hold still.', marked: true },
			{ text: ' Nothing moves.', marked: false }
		]);
	});

	it('merges overlapping quotes, in any order', () => {
		expect(highlightSegments(text, [quote(15, 26), quote(11, 20)]).filter((s) => s.marked)).toEqual(
			[{ text: 'You hold still.', marked: true }]
		);
	});

	it('ignores a quote whose offsets no longer match its words', () => {
		expect(highlightSegments(text, [{ start: 0, end: 3, text: 'You' }])).toEqual([
			{ text, marked: false }
		]);
	});

	it('handles a quote at either end, and no quotes', () => {
		expect(highlightSegments(text, [quote(0, 10)])[0]).toEqual({
			text: 'She waits.',
			marked: true
		});
		expect(highlightSegments(text, [])).toEqual([{ text, marked: false }]);
		expect(highlightSegments('', [])).toEqual([{ text: '', marked: false }]);
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
