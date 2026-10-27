import { describe, expect, it } from 'vitest';
import { lineEnds } from './bracelet';

describe('a bracelet’s lines', () => {
	it('start and end where the words’ tops change', () => {
		expect(lineEnds([0, 0, 20, 20, 20, 40])).toEqual([
			{ start: true, end: false },
			{ start: false, end: true },
			{ start: true, end: false },
			{ start: false, end: false },
			{ start: false, end: true },
			{ start: true, end: true }
		]);
	});

	it('takes a word a pixel out of line as on the same line', () => {
		expect(lineEnds([0, 0.5])).toEqual([
			{ start: true, end: false },
			{ start: false, end: true }
		]);
	});
});
