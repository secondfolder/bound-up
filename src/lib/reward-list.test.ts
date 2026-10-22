import { describe, expect, it } from 'vitest';
import { groupRewards, progressTowards, shortfallText } from './reward-list';

describe('groupRewards', () => {
	const reward = (id: string, cost: number, active = true) => ({ id, cost, active });

	it('puts what the balance covers first, cheapest first, then what it is short of, closest first', () => {
		const groups = groupRewards(
			[
				reward('bath', 4),
				reward('book', 18),
				reward('night', 10),
				reward('tea', 2),
				reward('trip', 12)
			],
			10
		);
		expect(groups.affordable.map((r) => r.id)).toEqual(['tea', 'bath', 'night']);
		expect(groups.saving.map((r) => r.id)).toEqual(['trip', 'book']);
		expect(groups.inactive).toEqual([]);
	});

	it('keeps an inactive reward out of both, whatever it costs', () => {
		const groups = groupRewards([reward('off', 1, false), reward('far', 99, false)], 10);
		expect(groups.affordable).toEqual([]);
		expect(groups.saving).toEqual([]);
		expect(groups.inactive.map((r) => r.id)).toEqual(['off', 'far']);
	});
});

describe('progressTowards', () => {
	it('is how far the balance is towards the cost, capped at full', () => {
		expect(progressTowards(18, 12)).toBe(66);
		expect(progressTowards(10, 0)).toBe(0);
		expect(progressTowards(4, 12)).toBe(100);
		expect(progressTowards(0, 0)).toBe(100);
	});
});

describe('shortfallText', () => {
	it('says how many more credits, and whose, from the side that set it', () => {
		expect(shortfallText(18, 12, 'claim')).toBe('6 more');
		expect(shortfallText(18, 12, 'set', 'Jun')).toBe('Jun needs 6 more');
		expect(shortfallText(4, 12, 'claim')).toBeNull();
	});
});
