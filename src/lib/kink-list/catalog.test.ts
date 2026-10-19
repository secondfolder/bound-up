import { describe, expect, it } from 'vitest';
import {
	catalog,
	catalogProblems,
	categories,
	childrenOf,
	depthOf,
	detailOf,
	kinkById,
	primaryCategoryOf,
	relatedKinks,
	SHARE_IDS,
	searchKinks
} from './catalog';

describe('the catalogue', () => {
	it('parses, with every item reachable from a category', () => {
		expect(catalog.items.length).toBeGreaterThan(400);
		for (const item of catalog.items) {
			expect(primaryCategoryOf(item).parent).toBeUndefined();
		}
	});

	it('puts every category in a section', () => {
		const total = Object.keys(catalog.sections).reduce(
			(sum, section) => sum + categories(section).length,
			0
		);
		expect(total).toBe(categories().length);
	});

	it('numbers every item for share links, once each', () => {
		expect(new Set(SHARE_IDS).size).toBe(SHARE_IDS.length);
		for (const item of catalog.items) {
			expect(SHARE_IDS).toContain(item.id);
		}
	});

	it('reports what one item cannot check about itself', () => {
		const base = {
			sections: { kinks: 'Kinks' },
			roles: { pair: { labels: ['A', 'B'], domSide: null } },
			tags: {}
		};
		const item = (fields: Record<string, unknown>) => ({
			name: 'x',
			intensity: 1,
			description: 'x',
			...(fields.parent ? { commonness: 2 } : {}),
			...fields
		});
		expect(
			catalogProblems(
				{
					...base,
					items: [
						item({ id: 'cat', section: 'kinks' }),
						item({ id: 'cat', section: 'kinks' }),
						item({ id: 'orphan', parent: 'nowhere' }),
						item({ id: 'nosection' }),
						item({ id: 'tagged', parent: 'cat', tags: ['mystery'], roles: 'who' }),
						item({ id: 'also', parent: 'cat', alsoUnder: ['tagged'] }),
						item({ id: 'k1', parent: 'cat' }),
						item({ id: 'k2', parent: 'k1', adds: 'some' }),
						item({ id: 'k3', parent: 'k2', adds: 'some' }),
						item({ id: 'rated', section: 'kinks', commonness: 2 }),
						item({ id: 'unrated', parent: 'cat', commonness: undefined }),
						item({ id: 'narrower', parent: 'k1', commonness: 3, adds: 'some' }),
						item({ id: 'lopsided', parent: 'cat', domSide: 'a' }),
						item({ id: 'both-ways', parent: 'cat', roles: 'pair', lean: 'dom' }),
						item({ id: 'adds-on-kink', parent: 'cat', adds: 'little' }),
						item({ id: 'no-adds', parent: 'k1' })
					]
				} as never,
				[
					'cat',
					'orphan',
					'nosection',
					'tagged',
					'also',
					'k1',
					'k2',
					'rated',
					'unrated',
					'narrower',
					'lopsided',
					'both-ways',
					'adds-on-kink',
					'no-adds'
				]
			)
		).toEqual([
			'duplicate id "cat"',
			'"orphan" has an unknown parent "nowhere"',
			'"orphan" is deeper than three levels',
			'category "nosection" has no known section',
			'"tagged" has an unknown role pair "who"',
			'"tagged" has an unknown tag "mystery"',
			'"also" is also under "tagged", which is not a category',
			'"k3" is deeper than three levels',
			'category "rated" has a commonness; only kinks do',
			'"unrated" has no commonness',
			'"narrower" is more common than "k1", the kink it narrows',
			'"lopsided" has a domSide but no role pair',
			'"both-ways" has a lean and a role pair; a pair takes domSide',
			'"adds-on-kink" has "adds", which only a specific has',
			'"no-adds" is a specific with no "adds"',
			'"k3" is missing from share-ids.json'
		]);
	});
});

describe('detailOf', () => {
	const detail = (id: string) => {
		const item = kinkById(id);
		if (!item) {
			throw new Error(`no kink "${id}"`);
		}
		return detailOf(item);
	};

	it('puts a kink where its commonness says, very common first', () => {
		expect(detail('kissing')).toBe(1);
		expect(detail('spanking')).toBe(2);
		expect(detail('impact')).toBe(1);
	});

	it('puts a specific above its kink, by how little it adds', () => {
		// Little: whoever answered kissing has all but answered these.
		expect(detail('kissing-mouth')).toBe(3);
		// Much: people answer blindfolds apart from sensory deprivation.
		expect(detail('blindfolds')).toBe(detail('sensory-deprivation'));
		// Never below its own commonness, nor past the top.
		expect(detail('spanking-implements')).toBe(4);
		expect(detail('double-anal')).toBe(5);
	});

	it('never shows a specific before its kink', () => {
		const early = catalog.items.filter((item) => {
			const parent = item.parent ? kinkById(item.parent) : undefined;
			return parent !== undefined && detailOf(item) < detailOf(parent);
		});
		expect(early.map((item) => item.id)).toEqual([]);
	});
});

describe('the tree', () => {
	it('knows how deep an item sits', () => {
		const spanking = kinkById('spanking');
		const paddle = kinkById('spanking-implements');
		expect(spanking && depthOf(spanking)).toBe(2);
		expect(paddle && depthOf(paddle)).toBe(3);
		expect(childrenOf('spanking').map((child) => child.id)).toContain('spanking-implements');
	});

	it('files a kink under one category, and lists it as related in the others it fits', () => {
		const rimming = kinkById('rimming');
		expect(rimming && primaryCategoryOf(rimming).id).toBe('oral');
		expect(relatedKinks('anal').map((kink) => kink.id)).toContain('rimming');
		expect(childrenOf('anal').map((kink) => kink.id)).not.toContain('rimming');
	});
});

describe('searchKinks', () => {
	it('finds a kink by an alias as well as its name', () => {
		expect(searchKinks('fellatio')[0]?.id).toBe('blowjobs');
		expect(searchKinks('blowjob')[0]?.id).toBe('blowjobs');
	});

	it('puts a name match ahead of an alias match', () => {
		const ids = searchKinks('spank').map((kink) => kink.id);
		expect(ids[0]).toBe('spanking');
	});

	it('ignores case and punctuation, and finds nothing for nothing', () => {
		expect(searchKinks('CNC').map((kink) => kink.id)).toContain('cnc');
		expect(searchKinks('st andrew’s cross').length).toBeGreaterThan(0);
		expect(searchKinks('   ')).toEqual([]);
	});

	it('leaves categories out', () => {
		expect(searchKinks('impact').every((kink) => kink.parent !== undefined)).toBe(true);
	});
});
