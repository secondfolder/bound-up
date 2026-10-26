import { describe, expect, it } from 'vitest';
import { isRating, itemExtrasText } from './blocks';
import { MENU_DESIGN_IDS, MENU_DESIGNS, menuDesign } from './menu-designs';

describe('an item’s rating and number as words', () => {
	const price = (value: number) => `$${value}`;

	it('says what each means, as the menu names them', () => {
		expect(
			itemExtrasText({ rating: 3, value: 12 }, { scale: 'Intensity', value: 'Price' }, price)
		).toBe(' (Intensity 3/5, Price $12)');
	});

	it('leaves out what the menu does not have, or the item has not been given', () => {
		expect(itemExtrasText({ rating: 3, value: 12 }, { scale: null, value: null }, price)).toBe('');
		expect(itemExtrasText({ rating: null, value: 12 }, { scale: 'Heat', value: null }, price)).toBe(
			''
		);
	});

	it('still reads as a rating when the scale has no name', () => {
		expect(itemExtrasText({ rating: 2, value: null }, { scale: '', value: null }, price)).toBe(
			' (Rated 2/5)'
		);
	});
});

describe('a rating', () => {
	it('is a whole number from one to five', () => {
		expect([0, 1, 5, 6, 2.5, '3'].map(isRating)).toEqual([false, true, true, false, false, false]);
	});
});

describe('the menu designs', () => {
	it('are each keyed by their own id, and write a number their own way', () => {
		for (const id of MENU_DESIGN_IDS) {
			expect(MENU_DESIGNS[id].id).toBe(id);
		}
		expect(MENU_DESIGNS.facts.value(40)).toBe('40%');
		expect(MENU_DESIGNS.diner.value(5)).toBe('$5.00');
	});

	it('read an id this build does not know as fine dining', () => {
		expect(menuDesign('plain').id).toBe('fine');
		expect(menuDesign(null).id).toBe('fine');
	});
});
