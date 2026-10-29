import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../../dream/random';
import { OVERUSED_NAMES } from '../../../dream/repetition';
import { drawNames, drawPool, genderOf, listFor } from './draw';
import { NAME_LISTS } from './lists';

describe('names', () => {
	it('reads a description for its background and gender', () => {
		expect(listFor('a German trainer in her fifties')?.id).toBe('german');
		expect(listFor('an Irish publican')?.id).toBe('irish-scottish');
		expect(listFor('a stranger on the train')).toBeNull();
		expect(genderOf('a German trainer in her fifties')).toBe('feminine');
		expect(genderOf('a gruff old man')).toBe('masculine');
		expect(genderOf('someone, anyone')).toBeNull();
	});

	it('draws names that fit, never overused, excluded or repeated', () => {
		const drawn = drawNames(
			{ description: 'an Italian woman', exclude: ['Beatrice'] },
			seededRandom(1)
		);
		const italian = NAME_LISTS.find((list) => list.id === 'italian');
		expect(drawn.background).toBe(italian?.label);
		expect(drawn.given).toHaveLength(10);
		expect(new Set(drawn.given).size).toBe(10);
		for (const name of drawn.given) {
			expect(italian?.feminine).toContain(name);
		}
		expect(drawn.given).not.toContain('Beatrice');
		expect(drawn.family).toHaveLength(10);
	});

	it('draws from every background for a plain description, and the same from the same seed', () => {
		const a = drawNames({ description: 'a stranger' }, seededRandom(7));
		expect(a.background).toBeNull();
		expect(a.given).toHaveLength(10);
		// Each pair from one background.
		a.given.forEach((given, index) => {
			const list = NAME_LISTS.find(
				(entry) => entry.feminine.includes(given) || entry.masculine.includes(given)
			);
			expect(list?.family).toContain(a.family[index]);
		});
		expect(drawNames({ description: 'a stranger' }, seededRandom(7))).toEqual(a);
	});

	it('keeps overused names out of every list and every pool', () => {
		const overused = new Set(OVERUSED_NAMES.map((name) => name.toLowerCase()));
		const pool = drawPool(seededRandom(3), ['Ottilie']);
		for (const name of pool.match(/[\p{L}’'-]+/gu) ?? []) {
			expect(overused.has(name.toLowerCase())).toBe(false);
		}
		expect(pool).not.toContain('Ottilie');
		expect(pool.split('\n')).toHaveLength(NAME_LISTS.length);
	});
});
