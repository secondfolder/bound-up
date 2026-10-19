import { describe, expect, it } from 'vitest';
import { type Answer, emptyList, type ListPayload, newCustomKey } from '../answers';
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

const full = (): ListPayload => {
	const key = newCustomKey();
	return list({
		answers: {
			// A kink without a role pair: one with a pair is answered per side.
			romance: {
				level: 'like',
				note: 'Over the knee, "firmly", please',
				detail: { fantasy: 4, experience: 1 },
				at
			},
			kissing: { sides: { a: { level: 'love' }, b: { level: 'limit' } }, at },
			[key]: { level: 'curious', at }
		},
		custom: { [key]: { name: 'Being read to', categoryId: 'intimacy', at } }
	});
};

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
			detail: { fantasy: 4, experience: 1 },
			note: 'Over the knee, "firmly", please'
		});
		expect(result?.answers.kissing).toEqual({
			sides: { a: { level: 'love' }, b: { level: 'limit' } }
		});
		expect(result?.unmatched).toEqual([
			{ name: 'Being read to', category: 'Intimacy and affection', answer: { level: 'curious' } }
		]);
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
		const next = applyImport(mine(), result, { mode: 'gaps', unmatchedTo: null, now: 9 });
		expect(next.answers.spanking?.level).toBe('not-for-me');
		expect(next.answers.caning).toEqual({ level: 'limit', at: 9 });
		expect(Object.keys(next.custom)).toHaveLength(0);
	});

	it('replaces answers when asked, and adds what did not match as the person’s own', () => {
		const next = applyImport(mine(), result, { mode: 'replace', unmatchedTo: 'fetishes', now: 9 });
		expect(next.answers.spanking?.level).toBe('love');
		const [[key, kink]] = Object.entries(next.custom);
		expect(kink).toMatchObject({ name: 'Mine', categoryId: 'fetishes' });
		expect((next.answers[key] as Answer).level).toBe('like');
	});

	it('keeps a Bound Up list’s own kinks in their own categories', () => {
		const imported = importList(full(), 'export');
		const next = applyImport(list(), imported, { mode: 'gaps', unmatchedTo: 'fetishes', now: 9 });
		expect(Object.values(next.custom)[0]).toMatchObject({
			name: 'Being read to',
			categoryId: 'intimacy'
		});
	});

	it('does not add a custom kink twice', () => {
		const once = applyImport(list(), result, { mode: 'gaps', unmatchedTo: 'fetishes', now: 9 });
		const twice = applyImport(once, result, { mode: 'gaps', unmatchedTo: 'fetishes', now: 10 });
		expect(Object.keys(twice.custom)).toHaveLength(1);
	});
});
