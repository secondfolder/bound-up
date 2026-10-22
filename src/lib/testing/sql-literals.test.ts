import { describe, expect, it } from 'vitest';
import { withLiterals } from './sql-literals';

describe('withLiterals', () => {
	it('writes numbers, nulls and strings in place of placeholders', () => {
		expect(
			withLiterals('update t set a = ?, b = ? where c = ?', [1_792_642_408_576, null, 'x'])
		).toBe("update t set a = 1792642408576, b = NULL where c = 'x'");
	});

	it('doubles a quote inside a string, so a value cannot end it', () => {
		expect(withLiterals('select ?', ["it's'; drop table user; --"])).toBe(
			"select 'it''s''; drop table user; --'"
		);
	});

	it('leaves a question mark inside quoted text alone', () => {
		expect(withLiterals('select \'?\', ? from "a?b"', [3])).toBe('select \'?\', 3 from "a?b"');
	});

	it('refuses a count of values that does not match the placeholders', () => {
		expect(() => withLiterals('select ?, ?', [1])).toThrow(/placeholders/);
		expect(() => withLiterals('select ?', [1, 2])).toThrow(/placeholders/);
	});

	it('refuses a number SQL cannot write', () => {
		expect(() => withLiterals('select ?', [Number.NaN])).toThrow(/Cannot write/);
	});
});
