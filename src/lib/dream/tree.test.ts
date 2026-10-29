import { describe, expect, it } from 'vitest';
import { indexTree, latestLeafUnder, newestLeaf, pathTo, versionsOf } from './tree';

const node = (id: string, parentId: string | null, at: number) => ({
	id,
	parentId,
	createdAt: new Date(at)
});

//   open ─ you ─ p1
//              └ p2 ─ you2
const tree = indexTree([
	node('open', null, 1),
	node('you', 'open', 2),
	node('p2', 'you', 4),
	node('p1', 'you', 3),
	node('you2', 'p2', 5)
]);

describe('the story tree', () => {
	it('finds the path from the opening', () => {
		expect(pathTo(tree, 'you2').map((n) => n.id)).toEqual(['open', 'you', 'p2', 'you2']);
		expect(pathTo(tree, 'missing')).toEqual([]);
		expect(pathTo(tree, null)).toEqual([]);
	});

	it('lists a passage’s versions oldest first', () => {
		expect(versionsOf(tree, 'p2').map((n) => n.id)).toEqual(['p1', 'p2']);
		expect(versionsOf(tree, 'open').map((n) => n.id)).toEqual(['open']);
	});

	it('follows a branch to where it was last left', () => {
		expect(latestLeafUnder(tree, 'you')?.id).toBe('you2');
		expect(latestLeafUnder(tree, 'p1')?.id).toBe('p1');
		expect(newestLeaf(tree)?.id).toBe('you2');
	});

	it('keeps a turn whose parent was not loaded, as an opening', () => {
		const partial = indexTree([node('late', 'gone', 9)]);
		expect(pathTo(partial, 'late').map((n) => n.id)).toEqual(['late']);
		expect(versionsOf(partial, 'late').map((n) => n.id)).toEqual(['late']);
	});

	it('survives a cycle a bad row could make', () => {
		const loop = indexTree([node('a', 'b', 1), node('b', 'a', 2)]);
		expect(pathTo(loop, 'a').map((n) => n.id)).toEqual(['b', 'a']);
	});
});
