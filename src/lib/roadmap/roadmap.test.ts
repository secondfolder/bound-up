import { describe, expect, it } from 'vitest';
import {
	allItems,
	crossReferenceProblems,
	dependents,
	featuredUpcoming,
	findItem,
	formatShippedOn,
	type RoadmapBranch,
	type RoadmapItem,
	recentlyShipped,
	roadmap,
	roadmapSchema,
	statusCounts
} from '.';
import data from './roadmap.json' with { type: 'json' };

function leaf(overrides: Partial<RoadmapItem> = {}): RoadmapItem {
	// The title follows the id, so fixtures only collide on the rule under test.
	const id = overrides.id ?? 'leaf';
	return { id, title: `Title of ${id}`, summary: 'A leaf.', status: 'planned', ...overrides };
}

function tree(...items: RoadmapItem[]): RoadmapBranch[] {
	return [{ id: 'branch', title: 'Branch', summary: 'A branch.', icon: 'tree', items }];
}

describe('roadmap.json', () => {
	it('parses', () => {
		expect(roadmapSchema.safeParse(data).success).toBe(true);
		expect(roadmap.branches.length).toBeGreaterThan(0);
	});

	it('has no cross-reference problems', () => {
		expect(crossReferenceProblems(roadmap.branches)).toEqual([]);
	});

	it('has something to feature and something recently shipped', () => {
		// The landing page's two rows are empty otherwise.
		expect(featuredUpcoming(6).length).toBeGreaterThan(0);
		expect(recentlyShipped(4).length).toBeGreaterThan(0);
	});
});

describe('schema', () => {
	it('rejects an unknown key, so a misspelling is not silently ignored', () => {
		const broken = { branches: tree({ ...leaf(), depends_on: ['x'] } as RoadmapItem) };
		expect(roadmapSchema.safeParse(broken).success).toBe(false);
	});

	it('rejects a fourth level', () => {
		const deep = leaf({ children: [{ ...leaf({ id: 'twig' }), children: [] } as RoadmapItem] });
		expect(roadmapSchema.safeParse({ branches: tree(deep) }).success).toBe(false);
	});

	it('rejects an id that is not kebab-case', () => {
		expect(roadmapSchema.safeParse({ branches: tree(leaf({ id: 'Kink List' })) }).success).toBe(
			false
		);
	});

	it('rejects an unknown status', () => {
		const broken = { branches: tree({ ...leaf(), status: 'done' } as unknown as RoadmapItem) };
		expect(roadmapSchema.safeParse(broken).success).toBe(false);
	});
});

describe('crossReferenceProblems', () => {
	it('flags a duplicate id, including across a leaf and a twig', () => {
		const items = [
			leaf({ id: 'a', children: [leaf({ id: 'b', title: 'Twig' })] }),
			leaf({ id: 'b', title: 'Leaf' })
		];
		expect(crossReferenceProblems(tree(...items))).toEqual(['duplicate id "b"']);
	});

	it('flags an item that shares an id with a branch', () => {
		expect(crossReferenceProblems(tree(leaf({ id: 'branch' })))).toEqual(['duplicate id "branch"']);
	});

	it('flags a duplicate title, since every item is a link named by it', () => {
		const items = [leaf({ id: 'a', title: 'Proof' }), leaf({ id: 'b', title: 'Proof' })];
		expect(crossReferenceProblems(tree(...items))).toEqual(['duplicate title "Proof"']);
	});

	it('flags a shipped item without a date, and a date on an unshipped item', () => {
		const items = [
			leaf({ id: 'a', status: 'shipped' }),
			leaf({ id: 'b', status: 'planned', shippedOn: '2026-09-01' })
		];
		expect(crossReferenceProblems(tree(...items))).toEqual([
			'"a" is shipped but has no shippedOn date',
			'"b" has a shippedOn date but is planned'
		]);
	});

	it('flags a featured item that has already shipped', () => {
		const shipped = leaf({ status: 'shipped', shippedOn: '2026-09-01', featured: true });
		expect(crossReferenceProblems(tree(shipped))).toEqual([
			'"leaf" is featured but already shipped'
		]);
	});

	it('flags a dependency on an id that does not exist', () => {
		expect(crossReferenceProblems(tree(leaf({ dependsOn: ['nope'] })))).toEqual([
			'"leaf" depends on unknown id "nope"'
		]);
	});

	it('flags a dependency cycle', () => {
		const items = [
			leaf({ id: 'a', dependsOn: ['b'] }),
			leaf({ id: 'b', dependsOn: ['c'] }),
			leaf({ id: 'c', dependsOn: ['a'] })
		];
		expect(crossReferenceProblems(tree(...items))).toEqual(['dependency cycle: a → b → c → a']);
	});
});

describe('selectors', () => {
	it('allItems includes twigs, with the leaf they hang off', () => {
		const twig = allItems().find((p) => p.item.id === 'message-tags');
		expect(twig?.parent?.id).toBe('messages');
		expect(twig?.branch.id).toBe('partners');
	});

	it('findItem finds a leaf and a twig, and nothing for a branch id', () => {
		expect(findItem('kink-list')?.item.title).toBe('Kink list');
		expect(findItem('voice-messages')?.parent?.id).toBe('messages');
		expect(findItem('notebook')).toBeUndefined();
	});

	it('dependents is the reverse of dependsOn', () => {
		const ids = dependents('kink-list').map((p) => p.item.id);
		expect(ids).toContain('compare-kink-lists');
		expect(ids).toContain('generated-guides');
	});

	it('featuredUpcoming is featured and unshipped, in file order, limited', () => {
		const all = featuredUpcoming(100);
		expect(all.every((p) => p.item.featured && p.item.status !== 'shipped')).toBe(true);
		const order = allItems().map((p) => p.item.id);
		const indices = all.map((p) => order.indexOf(p.item.id));
		expect(indices).toEqual(indices.toSorted((a, b) => a - b));
		expect(featuredUpcoming(2)).toHaveLength(Math.min(2, all.length));
	});

	it('recentlyShipped is newest first, limited', () => {
		const recent = recentlyShipped(100);
		const dates = recent.map((p) => p.item.shippedOn ?? '');
		expect(dates).toEqual(dates.toSorted((a, b) => b.localeCompare(a)));
		expect(recent.every((p) => p.item.status === 'shipped')).toBe(true);
		expect(recentlyShipped(3)).toHaveLength(3);
	});

	it('statusCounts adds up to every item', () => {
		const counts = statusCounts();
		const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
		expect(total).toBe(allItems().length);
	});
});

describe('formatShippedOn', () => {
	it('names the month the date is in, whatever the local time zone', () => {
		// UTC midnight on the 1st is still August in the Americas.
		expect(formatShippedOn('2026-09-01')).toBe('September 2026');
	});
});
