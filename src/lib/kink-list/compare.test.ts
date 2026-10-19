import { describe, expect, it } from 'vitest';
import { type Answer, emptyList, type ListPayload } from './answers';
import { compareLists, sidesLabel } from './compare';

const at = 1;

function list(answers: Record<string, Answer>, fields: Partial<ListPayload> = {}): ListPayload {
	return { ...emptyList(), answers, ...fields };
}

describe('compareLists', () => {
	it('groups each kink both answered by how the two answers fit', () => {
		const mine = list({
			romance: { level: 'like', at },
			cuddling: { level: 'love', at },
			massage: { level: 'conditional', at },
			'gentle-sex': { level: 'like', at },
			'pet-names': { level: 'love', at }
		});
		const theirs = list({
			romance: { level: 'love', at },
			cuddling: { level: 'curious', at },
			massage: { level: 'like', at },
			'gentle-sex': { level: 'dont-mind', at },
			'pet-names': { level: 'not-for-me', at }
		});
		const { groups } = compareLists(mine, theirs);
		expect(groups.both.map((pairing) => pairing.key)).toEqual(['romance']);
		expect(groups.explore.map((pairing) => pairing.key)).toEqual(['cuddling']);
		// Massage has a role pair answered for both sides: each way round is its own pairing.
		expect(groups.conditions.map((pairing) => [pairing.key, pairing.mySide])).toEqual([
			['massage', 'a'],
			['massage', 'b']
		]);
		expect(groups.talk.map((pairing) => pairing.key)).toEqual(['gentle-sex']);
		expect(groups.mismatch.map((pairing) => pairing.key)).toEqual(['pet-names']);
	});

	it('pairs my giving with their receiving, not with their giving', () => {
		const giverOnly = list({ spanking: { sides: { a: { level: 'love' } }, at } });
		const receiverOnly = list({ spanking: { sides: { b: { level: 'love' } }, at } });
		expect(compareLists(giverOnly, receiverOnly).groups.both).toEqual([
			{ key: 'spanking', mySide: 'a', mine: 'love', theirs: 'love' }
		]);
		expect(compareLists(giverOnly, giverOnly).groups.both).toEqual([]);
	});

	it('lists their limits, inherited ones included, and leaves them out of every group', () => {
		const mine = list({ 'anal-sex': { level: 'love', at } });
		const theirs = list({}, { triage: { anal: { value: 'limit', at } } });
		const comparison = compareLists(mine, theirs);
		expect(comparison.theirLimits).toContain('anal-sex');
		expect(comparison.groups.mismatch).toEqual([]);
		expect(comparison.groups.both).toEqual([]);
	});

	it('counts what you both want per category, most first', () => {
		const both = list({
			spanking: { level: 'like', at },
			flogging: { level: 'like', at },
			romance: { level: 'like', at }
		});
		expect(compareLists(both, both).overlap).toEqual([
			{ categoryId: 'impact', both: 2 },
			{ categoryId: 'intimacy', both: 1 }
		]);
	});
});

describe('sidesLabel', () => {
	it('says which halves were put together', () => {
		expect(sidesLabel('spanking', 'a')).toBe('You giving, them receiving');
		expect(sidesLabel('spanking', 'b')).toBe('You receiving, them giving');
		expect(sidesLabel('romance', null)).toBe('');
	});
});
