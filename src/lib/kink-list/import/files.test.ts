import { describe, expect, it } from 'vitest';
import { emptyList, type ListPayload } from '../answers';
import {
	answerFromWord,
	exportCsv,
	exportJson,
	importCsv,
	importList,
	kinkIdForName,
	parseCsv,
	readExportJson
} from './files';
import { applyImport, type ImportResult } from './result';

const at = 7;

function list(fields: Partial<ListPayload> = {}): ListPayload {
	return { ...emptyList(), ...fields };
}

const full = (): ListPayload =>
	list({
		answers: {
			// A kink without a role pair: one with a pair is answered per side.
			romance: {
				// Fantasy and reality apart, so the answer is reality's.
				level: 'like',
				note: 'Over the knee, "firmly", please',
				detail: { fantasy: 'love', doing: 'like', experience: 1 },
				at
			},
			kissing: { sides: { a: { level: 'love' }, b: { level: 'limit' } }, at }
		}
	});

describe('JSON', () => {
	it('round-trips a whole list exactly', () => {
		const source = full();
		expect(readExportJson(exportJson(source))).toEqual(source);
	});

	it('refuses anything that is not a Bound Up export', () => {
		expect(readExportJson('{"format":"other"}')).toBeNull();
		expect(readExportJson('not json')).toBeNull();
	});
});

describe('CSV', () => {
	it('parses quotes, doubled quotes, commas and newlines inside a cell', () => {
		expect(parseCsv('a,"b, c","d ""e""\nf"\r\n1,2,3\n')).toEqual([
			['a', 'b, c', 'd "e"\nf'],
			['1', '2', '3']
		]);
	});

	it('reads its own export back: levels, sides, the detailed answer and notes', () => {
		const result = importCsv(exportCsv(full()));
		expect(result?.answers.romance).toEqual({
			level: 'like',
			detail: { fantasy: 'love', doing: 'like', experience: 1 },
			note: 'Over the knee, "firmly", please'
		});
		expect(result?.answers.kissing).toEqual({
			sides: { a: { level: 'love' }, b: { level: 'limit' } }
		});
		expect(result?.unmatched).toEqual([]);
	});

	it('reads a spreadsheet from elsewhere by its headings, matching names and aliases', () => {
		const csv =
			'Activity,Response,Notes\nSpanking,Yes,\nFellatio,Hard limit,never\nUnheard of thing,Maybe,\n';
		const result = importCsv(csv);
		expect(result?.answers.spanking).toEqual({ level: 'like' });
		expect(result?.answers.blowjobs).toEqual({ level: 'limit', note: 'never' });
		expect(result?.unmatched[0]).toMatchObject({
			name: 'Unheard of thing',
			answer: { level: 'curious' }
		});
	});

	it('knows other lists’ words for answers, and leaves numbers alone', () => {
		expect(answerFromWord('Favorite')).toBe('love');
		expect(answerFromWord('Soft limit')).toBe('not-for-me');
		expect(answerFromWord("Don't mind")).toBe('dont-mind');
		expect(answerFromWord('Hard limit (never)')).toBe('limit');
		expect(answerFromWord('3')).toBeUndefined();
	});

	it('matches a name by any alias', () => {
		expect(kinkIdForName('BJ')).toBe('blowjobs');
		expect(kinkIdForName('Shibari')).toBe('shibari');
	});
});

describe('applyImport', () => {
	const result: ImportResult = {
		source: 'test',
		answers: { spanking: { level: 'love' }, caning: { level: 'limit' } },
		unmatched: [{ name: 'Mine', answer: { level: 'like' } }]
	};
	const mine = (): ListPayload => list({ answers: { spanking: { level: 'not-for-me', at: 1 } } });

	it('fills only the gaps by default', () => {
		const next = applyImport(mine(), result, { mode: 'gaps', now: 9 });
		expect(next.answers.spanking?.level).toBe('not-for-me');
		expect(next.answers.caning).toEqual({ level: 'limit', at: 9 });
	});

	it('takes a Bound Up list’s answers as they are, without their times', () => {
		const imported = importList(full(), 'export');
		expect(imported.answers.kissing).toEqual({
			sides: { a: { level: 'love' }, b: { level: 'limit' } }
		});
		expect(imported.unmatched).toEqual([]);
	});

	it('replaces answers when asked, and leaves out what did not match', () => {
		const next = applyImport(mine(), result, { mode: 'replace', now: 9 });
		expect(next.answers.spanking?.level).toBe('love');
		expect(Object.keys(next.answers).toSorted()).toEqual(['caning', 'spanking']);
	});
});
