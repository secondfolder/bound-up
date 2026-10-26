import { describe, expect, it } from 'vitest';
import { emptyList, type Level, type ListPayload } from '../kink-list/answers';
import { compareLists } from '../kink-list/compare';
import { ownKinkChips, sharedKinkChips } from './shared-kinks';

function list(answers: Record<string, Level | { a?: Level; b?: Level }>): ListPayload {
	const base = emptyList();
	return {
		...base,
		answers: Object.fromEntries(
			Object.entries(answers).map(([key, value]) => [
				key,
				typeof value === 'string'
					? { level: value, at: 1 }
					: {
							sides: {
								...(value.a ? { a: { level: value.a } } : {}),
								...(value.b ? { b: { level: value.b } } : {})
							},
							at: 1
						}
			])
		)
	};
}

describe('sharedKinkChips', () => {
	it('offers what you both want, the strongest first, and never a limit or a mismatch', () => {
		const mine = list({ cuddling: 'like', edging: 'love', choking: 'love', wax: 'like' });
		const theirs = list({
			cuddling: 'love',
			edging: 'love',
			choking: 'limit',
			wax: 'not-for-me'
		});
		const chips = sharedKinkChips(compareLists(mine, theirs), { level: 2, blind: false });
		expect(chips.map((chip) => chip.kinkId)).toEqual(['edging', 'cuddling']);
		expect(chips.find((chip) => chip.kinkId === 'edging')?.sides).toBe('Either way');
	});

	it('is one chip for a kink you both want either way round', () => {
		const both = list({ edging: 'love' });
		const chips = sharedKinkChips(compareLists(both, both), { level: 2, blind: false });
		expect(chips.map((chip) => [chip.kinkId, chip.sides])).toEqual([['edging', 'Either way']]);
	});

	it('matches a role kink across the two sides, and says which way round', () => {
		const mine = list({ spanking: { a: 'love' } });
		const theirs = list({ spanking: { b: 'like' } });
		const [chip] = sharedKinkChips(compareLists(mine, theirs), { level: 2, blind: false });
		expect(chip).toMatchObject({ kinkId: 'spanking', sides: 'You giving, them receiving' });
	});

	it('adds what one of you is curious about only further up, and never when comparing blind', () => {
		const comparison = compareLists(list({ wax: 'love' }), list({ wax: 'curious' }));
		expect(sharedKinkChips(comparison, { level: 2, blind: false })).toEqual([]);
		expect(
			sharedKinkChips(comparison, { level: 3, blind: false }).map((chip) => chip.kinkId)
		).toEqual(['wax']);
		expect(sharedKinkChips(comparison, { level: 5, blind: true })).toEqual([]);
	});

	it('shows nothing at the lowest step', () => {
		const both = list({ cuddling: 'love' });
		expect(sharedKinkChips(compareLists(both, both), { level: 0, blind: false })).toEqual([]);
	});
});

describe('ownKinkChips', () => {
	it('offers what you like or love, on whichever side', () => {
		const chips = ownKinkChips(
			list({ cuddling: 'love', spanking: { b: 'like' }, wax: 'curious', choking: 'limit' }),
			5
		);
		expect(chips.map((chip) => [chip.kinkId, chip.sides])).toEqual([
			['cuddling', ''],
			['spanking', 'Receiving']
		]);
	});
});
