import { describe, expect, it } from 'vitest';
import { type Answer, emptyList, type ListPayload, newCustomKey } from './answers';
import { childrenOf } from './catalog';
import { deckCards, deckReview, isInDeck, narrows } from './deck';

const at = 1;

function list(fields: Partial<ListPayload> = {}): ListPayload {
	return { ...emptyList(), ...fields };
}

describe('deckCards', () => {
	it('starts with the first category’s kinks, in catalogue order, and no specifics', () => {
		const cards = deckCards(list());
		const firstKinks = childrenOf('intimacy').map((kink) => kink.id);
		expect(cards.slice(0, firstKinks.length)).toEqual(firstKinks);
		// Specifics wait for a yes on their kink.
		expect(cards).not.toContain('spanking-implements');
	});

	it('moves on as cards are answered or skipped', () => {
		const answers: Record<string, Answer> = { romance: { level: 'like', at } };
		const cards = deckCards(list({ answers, skipped: { kissing: { skipped: true, at } } }));
		expect(cards).not.toContain('romance');
		expect(cards).not.toContain('kissing');
	});

	it('deals a kink’s specifics in straight after a yes', () => {
		const answers: Record<string, Answer> = { spanking: { level: 'curious', at } };
		const cards = deckCards(list({ answers }));
		const after = cards.indexOf('spanking-implements');
		expect(after).toBeGreaterThan(-1);
		// Where spanking was: before the next kink in Impact.
		expect(cards.indexOf('slapping')).toBeGreaterThan(after);
	});

	it('does not ask about the specifics after a no, or a don’t mind', () => {
		for (const level of ['not-for-me', 'dont-mind', 'limit'] as const) {
			const cards = deckCards(list({ answers: { spanking: { level, at } } }));
			expect(cards).not.toContain('spanking-implements');
		}
	});

	it('counts a yes on one side as a yes', () => {
		const answers: Record<string, Answer> = {
			spanking: { sides: { a: { level: 'love' } }, at }
		};
		expect(deckCards(list({ answers }))).toContain('spanking-implements');
	});

	it('leaves out skipped and hard-limited categories', () => {
		const triage = {
			intimacy: { value: 'skip' as const, at },
			oral: { value: 'limit' as const, at }
		};
		const cards = deckCards(list({ triage }));
		expect(cards).not.toContain('romance');
		expect(cards).not.toContain('blowjobs');
		expect(isInDeck(list({ triage }), 'hands')).toBe(true);
	});

	it('leaves out kinks past the level of detail', () => {
		const cards = deckCards(list({ settings: { detail: 2, side: 'both', at } }));
		expect(cards).toContain('spanking');
		expect(cards).not.toContain('caning');
	});

	it('includes a custom kink after its category’s own', () => {
		const key = newCustomKey();
		const custom = { [key]: { name: 'Being read to', categoryId: 'intimacy', at } };
		const cards = deckCards(list({ custom }));
		expect(cards.indexOf(key)).toBe(childrenOf('intimacy').length);
	});
});

describe('deckReview', () => {
	it('lists own limits, wholesale categories, conditions and what was skipped', () => {
		const key = newCustomKey();
		const review = deckReview(
			list({
				answers: {
					caning: { level: 'limit', at },
					kissing: { sides: { b: { level: 'conditional' } }, at },
					[key]: { level: 'limit', at }
				},
				custom: { [key]: { name: 'Mine', categoryId: 'intimacy', at } },
				triage: { extreme: { value: 'limit', at } },
				skipped: { tickling: { skipped: true, at }, flogging: { skipped: false, at } }
			})
		);
		expect(review.limits).toEqual(['caning', key]);
		expect(review.limitCategories).toEqual(['extreme']);
		expect(review.conditional).toEqual(['kissing']);
		expect(review.skipped).toEqual(['tickling']);
	});

	it('forgets a removed custom kink', () => {
		const key = newCustomKey();
		const review = deckReview(
			list({
				answers: { [key]: { level: 'limit', at } },
				custom: { [key]: { name: 'Mine', categoryId: 'intimacy', removed: true, at } }
			})
		);
		expect(review.limits).toEqual([]);
	});
});

describe('narrows', () => {
	it('names the kink a specific narrows down, and nothing for a kink', () => {
		expect(narrows('spanking-implements')?.id).toBe('spanking');
		expect(narrows('spanking')).toBeUndefined();
	});
});

describe('deckCards, with filters', () => {
	it('leaves out kinks past the level of detail it is given', () => {
		const all = deckCards(list());
		const common = deckCards(list(), { detail: 1, side: 'both' });
		expect(common.length).toBeGreaterThan(0);
		expect(common.length).toBeLessThan(all.length);
		expect(common).not.toContain('spanking');
	});
});
