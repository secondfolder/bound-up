import { describe, expect, it } from 'vitest';
import type { DaydreamTurnContent, PassageMeta } from '../sealed-kinds/daydreams';
import {
	childrenOf,
	currentDirections,
	indexTree,
	isHalted,
	latestLeafUnder,
	type OpenedTurn,
	pathTo,
	siblingsOf,
	type TreeNode
} from './tree';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 12, minute));
const node = (id: string, parentId: string | null, minute: number): TreeNode => ({
	id,
	parentId,
	createdAt: at(minute)
});

/*
 *   a ─ b ─ c
 *        └─ d ─ e      (d written after c, so the newest branch)
 *   r              (a second root: a retried opening)
 */
const tree = indexTree([
	node('a', null, 0),
	node('b', 'a', 1),
	node('c', 'b', 2),
	node('d', 'b', 3),
	node('e', 'd', 4),
	node('r', null, 5)
]);

describe('pathTo', () => {
	it('walks from the root down to the leaf', () => {
		expect(pathTo(tree, 'e').map((each) => each.id)).toEqual(['a', 'b', 'd', 'e']);
		expect(pathTo(tree, 'c').map((each) => each.id)).toEqual(['a', 'b', 'c']);
	});

	it('is empty for no leaf, or one that is not there', () => {
		expect(pathTo(tree, null)).toEqual([]);
		expect(pathTo(tree, 'nope')).toEqual([]);
	});

	it('treats a turn whose parent was not loaded as a root', () => {
		const partial = indexTree([node('x', 'missing', 0), node('y', 'x', 1)]);
		expect(pathTo(partial, 'y').map((each) => each.id)).toEqual(['x', 'y']);
		expect(childrenOf(partial, null).map((each) => each.id)).toEqual(['x']);
	});

	it('stops rather than looping on a cycle', () => {
		const looped = indexTree([node('p', 'q', 0), node('q', 'p', 1)]);
		expect(pathTo(looped, 'p').length).toBeLessThanOrEqual(2);
	});
});

describe('siblings and children', () => {
	it('lists a fork oldest first, itself included', () => {
		expect(siblingsOf(tree, 'd').map((each) => each.id)).toEqual(['c', 'd']);
		expect(siblingsOf(tree, 'a').map((each) => each.id)).toEqual(['a', 'r']);
		expect(childrenOf(tree, 'b').map((each) => each.id)).toEqual(['c', 'd']);
	});
});

describe('latestLeafUnder', () => {
	it('goes to where the newest branch through a turn was left', () => {
		expect(latestLeafUnder(tree, 'a')).toBe('e');
		expect(latestLeafUnder(tree, 'c')).toBe('c');
		expect(latestLeafUnder(tree, 'r')).toBe('r');
	});

	it('breaks a tie in time by id', () => {
		const tied = indexTree([node('root', null, 0), node('k1', 'root', 1), node('k2', 'root', 1)]);
		expect(latestLeafUnder(tied, 'root')).toBe('k2');
	});
});

const turn = (content: DaydreamTurnContent | null): OpenedTurn => ({ content });
const said = (text: string) => turn({ type: 'text', text });
const passage = (meta: Partial<PassageMeta>) =>
	turn({
		type: 'text',
		text: 'A passage.',
		meta: { suggestions: [], directions: { add: [], remove: [] }, ...meta }
	});
const safety = (signal: 'red' | 'yellow' | 'resume') => turn({ type: 'safety', signal });

describe('isHalted', () => {
	it('is stopped after Stop the scene, until something carries on', () => {
		expect(isHalted([said('hi')])).toBe(false);
		expect(isHalted([said('hi'), safety('red')])).toBe(true);
		expect(isHalted([safety('red'), passage({ ooc: true })])).toBe(true);
		expect(isHalted([safety('red'), said('ok'), safety('resume')])).toBe(false);
		expect(isHalted([safety('red'), safety('yellow')])).toBe(false);
	});

	it('looks only at the latest signal', () => {
		expect(isHalted([safety('resume'), safety('red')])).toBe(true);
		expect(isHalted([safety('yellow'), passage({})])).toBe(false);
	});

	it('skips turns still opening', () => {
		expect(isHalted([safety('red'), turn(null)])).toBe(true);
	});
});

describe('currentDirections', () => {
	const slower = { id: 'slower', label: 'Slower' };
	const crueler = { id: 'crueler', label: 'Crueler' };

	it('folds each passage’s additions and removals along the path', () => {
		const path = [
			passage({ directions: { add: [slower, crueler], remove: [] } }),
			said('more'),
			passage({ directions: { add: [], remove: ['slower'] } })
		];
		expect(currentDirections(path)).toEqual([crueler]);
	});

	it('replaces a button of the same id or label rather than doubling it', () => {
		const path = [
			passage({ directions: { add: [slower], remove: [] } }),
			passage({ directions: { add: [{ id: 'slow-down', label: 'slower' }], remove: [] } })
		];
		expect(currentDirections(path)).toEqual([{ id: 'slow-down', label: 'slower' }]);
	});

	it('keeps the newest six', () => {
		const add = Array.from({ length: 8 }, (_, index) => ({ id: `d${index}`, label: `D${index}` }));
		const result = currentDirections([
			passage({ directions: { add: add.slice(0, 6), remove: [] } }),
			passage({ directions: { add: add.slice(6), remove: [] } })
		]);
		expect(result.map((direction) => direction.id)).toEqual(['d2', 'd3', 'd4', 'd5', 'd6', 'd7']);
	});

	it('ignores turns with no meta', () => {
		expect(currentDirections([said('x'), turn(null), safety('red')])).toEqual([]);
	});
});
