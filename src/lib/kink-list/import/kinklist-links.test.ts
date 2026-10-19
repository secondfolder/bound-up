import { describe, expect, it } from 'vitest';
import { encodeKinklistHash } from './kinklist-hash';
import {
	detectKinklistLink,
	fitOf,
	importFromList,
	importKinklistLink,
	loadSourceList,
	type SourceList,
	sideOfColumn
} from './kinklist-links';

describe('detectKinklistLink', () => {
	const hash = '#abcdefghijklmnop';

	it('knows each site, and which list a link names', () => {
		expect(
			detectKinklistLink(`https://goctionni.github.io/KinkList/v1.0.2.html${hash}`)?.sources
		).toEqual(['goctionni']);
		expect(
			detectKinklistLink(`https://cdn.rawgit.com/Goctionni/KinkList/master/v1.html${hash}`)?.sources
		).toEqual(['goctionni']);
		expect(detectKinklistLink(`https://kinksheet.com/${hash}`)?.sources).toEqual(['kinksheet']);
		expect(detectKinklistLink(`https://notlewdjustkinky.com/kinklist_irl${hash}`)?.sources).toEqual(
			['notlewdjustkinky-irl']
		);
		expect(detectKinklistLink(`https://notlewdjustkinky.com/kinklist${hash}`)?.sources).toEqual([
			'notlewdjustkinky'
		]);
		expect(
			detectKinklistLink(`https://adhesivecheese.github.io/kinklist/${hash}`)?.sources
		).toHaveLength(3);
	});

	it('refuses Goctionni’s lists from before v1, other sites, and links with nothing in them', () => {
		expect(
			detectKinklistLink(`https://goctionni.github.io/KinkList/v0.9.9.html${hash}`)
		).toBeNull();
		expect(detectKinklistLink(`https://example.com/${hash}`)).toBeNull();
		expect(detectKinklistLink('https://kinksheet.com/#short')).toBeNull();
		expect(detectKinklistLink('not a link')).toBeNull();
	});
});

describe('sideOfColumn', () => {
	it('reads a column heading as the side it means', () => {
		expect(sideOfColumn('Giving')).toBe('a');
		expect(sideOfColumn('Recieving')).toBe('b');
		expect(sideOfColumn('As Dominant')).toBe('a');
		expect(sideOfColumn('On others')).toBe('b');
		expect(sideOfColumn('Being center')).toBeNull();
	});
});

const sample: SourceList = {
	id: 'goctionni',
	title: 'A sample',
	levels: [null, 'love', 'like', 'dont-mind', 'curious', 'not-for-me'],
	categories: [
		{
			name: 'Pain',
			columns: ['Giving', 'Receiving'],
			items: [
				{ name: 'Spanking', id: 'spanking' },
				{ name: 'Something new', id: undefined }
			]
		},
		{
			name: 'General',
			columns: ['General'],
			items: [
				{ name: 'Romance', id: 'romance' },
				{ name: 'Rimming (Receiving)', id: 'rimming', side: 'b' }
			]
		},
		{
			name: 'Clothing',
			columns: ['Self', 'Partner'],
			items: [{ name: 'Not a kink', id: 'romance-2' }]
		},
		{ name: 'Meta', columns: ['General'], items: [{ name: 'Post length', ignore: true }] }
	]
};

describe('importFromList', () => {
	it('maps each answer to its kink, by side where the list has sides', () => {
		const result = importFromList(sample, [1, 5, 2, 0, 3, 4, 0, 0, 2]);
		expect(result.answers.spanking).toEqual({
			sides: { a: { level: 'love' }, b: { level: 'not-for-me' } }
		});
		expect(result.answers.romance).toEqual({ level: 'dont-mind' });
		expect(result.answers.rimming).toEqual({ sides: { b: { level: 'curious' } } });
		// Answered but unknown here: offered as the person's own.
		expect(result.unmatched).toEqual([
			{ name: 'Something new', category: 'Pain', answer: { level: 'like' } }
		]);
	});

	it('leaves out a role-play admin category', () => {
		const result = importFromList(sample, [0, 0, 0, 0, 0, 0, 0, 0, 2]);
		expect(result.unmatched).toEqual([]);
		expect(result.answers).toEqual({});
	});

	it('folds two columns into one answer for a kink without sides, and says what they were', () => {
		const list: SourceList = {
			...sample,
			categories: [
				{ name: 'X', columns: ['Self', 'Partner'], items: [{ name: 'Romance', id: 'romance' }] }
			]
		};
		expect(importFromList(list, [2, 5]).answers.romance).toEqual({
			level: 'like',
			note: 'Imported as Romance (Self): Like · Romance (Partner): Not for me'
		});
	});
});

describe('importKinklistLink', () => {
	it('reads a KinkSheet link: the list, its levels, and its sides', async () => {
		const list = await loadSourceList('kinksheet');
		const positions = list.categories.reduce(
			(sum, c) => sum + c.items.length * c.columns.length,
			0
		);
		const values = new Array<number>(positions).fill(0);
		// The first item of the first category: Romance / Affection, General: Favorite.
		values[0] = 1;
		const hash = encodeKinklistHash(values, list.levels.length);
		const read = await importKinklistLink({ sources: ['kinksheet'], hash });
		expect(read?.source).toBe('kinksheet');
		expect(read?.result.answers.romance).toEqual({ level: 'love' });
	});

	it('works out which adhesiveCheese preset a link was made on from its length', async () => {
		for (const id of [
			'adhesivecheese-classic',
			'adhesivecheese-detailed',
			'adhesivecheese-plsno'
		] as const) {
			const list = await loadSourceList(id);
			const positions = list.categories.reduce(
				(sum, c) => sum + c.items.length * c.columns.length,
				0
			);
			const hash = encodeKinklistHash(new Array<number>(positions).fill(1), list.levels.length);
			expect(fitOf(list, hash)).toBe(0);
			const read = await importKinklistLink({
				sources: ['adhesivecheese-classic', 'adhesivecheese-detailed', 'adhesivecheese-plsno'],
				hash
			});
			expect(read?.source).toBe(id);
		}
	});

	it('maps nearly every item of the most used lists', async () => {
		for (const id of ['goctionni', 'kinksheet', 'adhesivecheese-classic'] as const) {
			const list = await loadSourceList(id);
			const items = list.categories
				.flatMap((category) => category.items)
				.filter((item) => !item.ignore);
			const mapped = items.filter((item) => item.id).length;
			expect(mapped / items.length).toBeGreaterThan(0.95);
		}
	});
});
