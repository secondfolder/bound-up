import { describe, expect, it } from 'vitest';
import { defined } from './testing/defined';
import { forcedOpen, type LaidBranch, type LaidNode, layoutTree, longestChild } from './tree';

type Node = { id: string; kids?: Node[]; hidden?: boolean };

const n = (id: string, ...kids: Node[]): Node => ({ id, kids });
const h = (id: string, ...kids: Node[]): Node => ({ id, kids, hidden: true });

const children = (node: Node) => node.kids ?? [];
const key = (node: Node) => node.id;
const hidden = (node: Node) => node.hidden === true;

/** A branch as a string: its line, with each node's forks in brackets. */
function outline(branch: LaidBranch<Node>): string {
	return branch.line.map(nodeOutline).join(' ');
}

function nodeOutline(node: LaidNode<Node>): string {
	return node.forks.length > 0 ? `${node.key}[${node.forks.map(outline).join(', ')}]` : node.key;
}

function laid(layout: ReturnType<typeof layoutTree<Node>>, id: string): LaidNode<Node> {
	return defined(layout.byKey.get(id), id).laid;
}

describe('layoutTree', () => {
	it('without a main child: a bare trunk, every root a bough, every child a branch', () => {
		const layout = layoutTree({
			roots: [n('a', n('a1', n('a1x')), n('a2')), n('b')],
			children,
			key
		});
		expect(layout.trunk).toEqual([]);
		expect(layout.crown.map(outline)).toEqual(['a[a1[a1x], a2]', 'b']);
		expect(layout.crown.map((branch) => branch.depth)).toEqual([1, 1]);
		expect(laid(layout, 'a1x').depth).toBe(3);
		expect(laid(layout, 'a1x').start).toBe(true);
	});

	it('with one: the main child carries the line on, and the rest branch off it', () => {
		const tree = [n('r', n('x', n('x1')), n('y', n('y1', n('y2'), n('z'))))];
		const layout = layoutTree({ roots: tree, children, key, main: longestChild(children) });
		expect(layout.trunk.map(nodeOutline)).toEqual(['r[x x1]', 'y', 'y1[z]', 'y2']);
		expect(laid(layout, 'x').depth).toBe(1);
		expect(laid(layout, 'x').start).toBe(true);
		expect(laid(layout, 'x1').start).toBe(false);
		expect(layout.trunk.every((node) => node.depth === 0 && !node.start)).toBe(true);
	});

	it('puts roots off the trunk in the crown, above it', () => {
		const layout = layoutTree({
			roots: [n('short'), n('long', n('on'))],
			children,
			key,
			main: longestChild(children)
		});
		expect(layout.crown.map(outline)).toEqual(['short']);
		expect(layout.trunk.map((node) => node.key)).toEqual(['long', 'on']);
	});

	it('ignores a main that is not one of the children', () => {
		const stray = n('stray');
		const layout = layoutTree({ roots: [n('a', n('b'))], children, key, main: () => stray });
		expect(layout.trunk).toEqual([]);
		expect(layout.crown.map(outline)).toEqual(['a[b]']);
	});

	it('counts what folding hides: everything under a branch start, only the forks elsewhere', () => {
		const tree = [n('r', n('x', n('x1', n('x2')), n('xf')), n('y', n('y1', n('y2', n('y3')))))];
		const layout = layoutTree({ roots: tree, children, key, main: longestChild(children) });
		// x starts a bough: x1, x2 and xf go with it. x1 is further down its
		// line, and has nothing branching off.
		expect(laid(layout, 'x').folds).toBe(3);
		expect(laid(layout, 'x1').folds).toBe(0);
		// r is on the trunk: only its bough folds, never the trunk.
		expect(laid(layout, 'r').folds).toBe(4);
		expect(laid(layout, 'y').folds).toBe(0);
	});

	it('lays out a line thousands long without running out of stack', () => {
		let deepest = n('n5000');
		for (let at = 4999; at >= 0; at -= 1) {
			deepest = n(`n${at}`, deepest);
		}
		const layout = layoutTree({ roots: [deepest], children, key, main: longestChild(children) });
		expect(layout.trunk).toHaveLength(5001);
	});
});

describe('dimming', () => {
	it('dims a stretch only when everything it leads to is hidden, at any depth', () => {
		const layout = layoutTree({
			roots: [n('a', h('a1', n('a1x'), h('a1y')), h('a2', h('a2x', h('a2xx'))), h('a3'))],
			children,
			key,
			hidden
		});
		const [a] = layout.crown;
		const [a1, a2, a3] = defined(a, 'a').line[0]?.forks ?? [];
		// a1 is hidden, but its shown twig reaches the trunk through it.
		expect(defined(a1, 'a1').dim).toEqual({ above: false, elbow: false, onward: true });
		expect(laid(layout, 'a1').dim.below).toBe(false);
		// a2 and everything under it, three deep, are hidden.
		expect(defined(a2, 'a2').dim).toEqual({ above: true, elbow: true, onward: true });
		expect(laid(layout, 'a2').dim.below).toBe(true);
		expect(laid(layout, 'a2x').dim.below).toBe(true);
		expect(defined(a3, 'a3').dim).toEqual({ above: true, elbow: true, onward: true });
		// a itself counts as shown, and so do its bough and stem.
		expect(defined(a, 'a').dim.elbow).toBe(false);
		expect(laid(layout, 'a').allHidden).toBe(false);
	});

	it('dims the line between two nodes when everything after it is hidden', () => {
		const tree = [n('r', n('x', h('x1', h('x2')), n('xf')), n('y', n('y1', n('y2', n('y3')))))];
		const layout = layoutTree({
			roots: tree,
			children,
			key,
			hidden,
			main: longestChild(children)
		});
		// x's line goes on to x1 and x2, both hidden; its fork xf is shown.
		expect(laid(layout, 'x').dim).toEqual({ below: false, into: false, through: true });
		expect(laid(layout, 'x1').dim).toEqual({ below: true, into: true, through: true });
		// The trunk never dims.
		expect(layout.trunk.every((node) => !(node.dim.below || node.dim.into))).toBe(true);
	});
});

describe('forcedOpen', () => {
	const tree = [
		n('r', n('x', n('x1', n('x2')), n('xf', n('xf1'))), n('y', n('y1', n('y2', n('y3')))))
	];
	const layout = layoutTree({ roots: tree, children, key, main: longestChild(children) });

	it('opens a branch start above a revealed node, and a fork it leaves a line by', () => {
		expect([...forcedOpen(layout, ['xf1'])].toSorted()).toEqual(['r', 'x', 'xf']);
	});

	it('leaves alone a line node the way to it does not leave by', () => {
		// x1 is a later node on x's line: x (a start) opens, x1 itself never.
		expect([...forcedOpen(layout, ['x2'])].toSorted()).toEqual(['r', 'x']);
		// On the trunk, nothing need open at all.
		expect([...forcedOpen(layout, ['y3'])]).toEqual([]);
	});

	it('knows nothing of a key that is not in the tree', () => {
		expect([...forcedOpen(layout, ['nowhere'])]).toEqual([]);
	});
});

describe('longestChild', () => {
	it('picks the child with the most generations under it', () => {
		const main = longestChild(children);
		const short = n('short', n('s1'));
		const long = n('long', n('l1', n('l2')));
		expect(main([short, long])?.id).toBe('long');
	});

	it('breaks a tie with the preference, then keeps the first', () => {
		const a = n('a');
		const b = n('b');
		expect(longestChild(children)([a, b])?.id).toBe('a');
		expect(
			longestChild(children, (x, y) => Number(y.id === 'b') - Number(x.id === 'b'))([a, b])?.id
		).toBe('b');
	});

	it('has nothing to pick from no children', () => {
		expect(longestChild(children)([])).toBeUndefined();
	});
});
