import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { defined } from '$lib/testing/defined';
import TreeHarness, { type HarnessNode } from '$lib/testing/TreeHarness.svelte';
// The palette the dim colours mix toward.
import '$lib/theme.css';

/*
 * The roadmap's tests (RoadmapTree.svelte.test.ts) measure boughs, elbows,
 * stems, packing and mirroring on a real, bare-trunked tree. These cover what
 * only a tree with a `main` has: nodes on the trunk, and lines of more than
 * one node with forks part-way down.
 */

const n = (id: string, ...kids: HarnessNode[]): HarnessNode => ({ id, kids });
const h = (id: string, ...kids: HarnessNode[]): HarnessNode => ({ id, kids, hidden: true });

/**
 *   r ─ y ─ y1 ─ y2 ─ y3 ─ y4         the trunk
 *   └─ x ─ x1 ─ x2 ─ x3               a bough, whose line forks at x1
 *           └─ f ─ f1
 */
const TREE = [
	n(
		'r',
		n('x', n('x1', n('x2', n('x3')), n('f', n('f1')))),
		n('y', n('y1', n('y2', n('y3', n('y4')))))
	)
];

function px(value: string): number {
	return Number.parseFloat(value);
}

function box(element: Element) {
	return element.getBoundingClientRect();
}

function centre(element: Element) {
	const b = box(element);
	return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

function nodeOf(container: Element, id: string): HTMLElement {
	const item = defined(container.querySelector(`[data-id="${id}"]`), id);
	return defined(item.closest<HTMLElement>('.tree-node'), `the tree node around ${id}`);
}

function markerOf(container: Element, id: string): Element {
	return defined(nodeOf(container, id).querySelector('.marker'), `${id}'s marker`);
}

/** A pseudo-element's box on the page, from its computed offsets against its element. */
function pseudoBox(element: Element, pseudo: '::before' | '::after') {
	const style = getComputedStyle(element, pseudo);
	const outer = box(element);
	const top = outer.top + px(style.top);
	const left = outer.left + px(style.left);
	return { top, left, bottom: top + px(style.height), centreX: left + px(style.width) / 2 };
}

describe('Tree', () => {
	it('centres every node on the trunk on it', () => {
		const { container } = render(TreeHarness, { roots: TREE, trunk: true });
		const trunk = defined(container.querySelector('.trunk'), 'the trunk');
		const trunkX = pseudoBox(trunk, '::before').centreX;
		for (const id of ['r', 'y', 'y1', 'y2', 'y3', 'y4']) {
			expect(centre(markerOf(container, id)).x, id).toBeCloseTo(trunkX, 0);
			// The trunk is the line: no thin line of its own hangs from it.
			expect(getComputedStyle(nodeOf(container, id), '::after').content, id).toBe('none');
		}
	});

	it('reaches a bough from the trunk to the marker of the turn it starts with', () => {
		const { container } = render(TreeHarness, { roots: TREE, trunk: true });
		const trunk = defined(container.querySelector('.trunk'), 'the trunk');
		const bough = pseudoBox(nodeOf(container, 'x'), '::before');
		const marker = box(markerOf(container, 'x'));
		expect(bough.left).toBeCloseTo(pseudoBox(trunk, '::before').centreX, 0);
		expect(bough.left + px(getComputedStyle(nodeOf(container, 'x'), '::before').width)).toBeCloseTo(
			marker.left,
			0
		);
		const style = getComputedStyle(nodeOf(container, 'x'), '::before');
		expect(bough.top + px(style.height) / 2).toBeCloseTo(centre(markerOf(container, 'x')).y, 0);
	});

	it('joins each node on a line to the next, down the middle of their markers', () => {
		const { container } = render(TreeHarness, { roots: TREE, trunk: true });
		for (const [from, to] of [
			['x', 'x1'],
			['x1', 'x2'],
			['x2', 'x3']
		] as const) {
			const above = markerOf(container, from);
			const below = markerOf(container, to);
			// Down from under the upper marker...
			const stem = pseudoBox(nodeOf(container, from), '::after');
			expect(stem.top, from).toBeCloseTo(box(above).bottom, 0);
			expect(stem.centreX, from).toBeCloseTo(centre(above).x, 0);
			// ...to the lower one's middle, through anything forking between.
			const step = defined(nodeOf(container, to).parentElement, `${to}'s step`);
			const into = pseudoBox(step, '::before');
			expect(into.bottom, to).toBeCloseTo(centre(below).y, 0);
			expect(into.centreX, to).toBeCloseTo(centre(below).x, 0);
			// No gap anywhere along the way.
			const forks = step.previousElementSibling?.matches('.tree-forks.through')
				? pseudoBox(step.previousElementSibling, '::before')
				: null;
			const reached = forks ? forks.bottom : stem.bottom;
			expect(reached, `${from} to ${to}`).toBeGreaterThanOrEqual(box(step).top);
		}

		// x1 forks before its line goes on: the line past the fork picks up
		// where x1's stem leaves off, straight down from x1's marker.
		const through = defined(container.querySelector('.tree-forks.through'), 'the line past f');
		const past = pseudoBox(through, '::before');
		expect(past.top).toBeLessThanOrEqual(pseudoBox(nodeOf(container, 'x1'), '::after').bottom);
		expect(past.centreX).toBeCloseTo(centre(markerOf(container, 'x1')).x, 0);
	});

	it('draws every marker over the lines that meet it', () => {
		const { container } = render(TreeHarness, { roots: TREE, trunk: true });
		for (const marker of container.querySelectorAll<HTMLElement>('.marker')) {
			const { x, y } = centre(marker);
			const hit = document.elementFromPoint(x, y);
			expect(hit === marker || marker.contains(hit)).toBe(true);
		}
	});

	it('dims the line on to hidden nodes, and nothing else', () => {
		const tree = [
			n(
				'r',
				n('x', n('x1', h('x2', h('x3')), n('f', n('f1')))),
				n('y', n('y1', n('y2', n('y3', n('y4')))))
			)
		];
		const { container } = render(TreeHarness, { roots: tree, trunk: true });
		const z = (element: Element, pseudo: '::before' | '::after') =>
			getComputedStyle(element, pseudo).zIndex;
		const stepOf = (id: string) => defined(nodeOf(container, id).parentElement, `${id}'s step`);
		// Into x2 and x3: hidden, so underneath.
		expect(z(stepOf('x2'), '::before')).toBe('-1');
		expect(z(stepOf('x3'), '::before')).toBe('-1');
		// Past x1's fork to x2: everything it leads to is hidden.
		expect(
			z(defined(container.querySelector('.tree-forks.through'), 'the line past f'), '::before')
		).toBe('-1');
		// But x1's own stem still leads to its shown fork.
		expect(z(nodeOf(container, 'x1'), '::after')).toBe('auto');
		expect(z(stepOf('x1'), '::before')).toBe('auto');
	});

	describe('folded', () => {
		const toggleOf = (container: Element, id: string) =>
			defined(
				nodeOf(container, id).querySelector<HTMLButtonElement>(':scope > .tree-toggle'),
				`${id}'s toggle`
			);
		const shown = (container: Element) =>
			[...container.querySelectorAll('[data-id]')].map((item) => item.getAttribute('data-id'));

		it('offers a toggle only where there is something to fold', () => {
			const { container } = render(TreeHarness, { roots: TREE, trunk: true });
			const withToggle = [...container.querySelectorAll('.tree-toggle')].map((toggle) =>
				toggle.closest('.tree-node')?.querySelector('[data-id]')?.getAttribute('data-id')
			);
			// r: its bough. x: the branch it starts. x1: its fork. f: its line.
			expect(withToggle).toEqual(['r', 'x', 'x1', 'f']);
		});

		it('folds a line node’s forks and keeps its line, and a branch start’s whole branch', async () => {
			const { container } = render(TreeHarness, { roots: TREE, trunk: true });
			toggleOf(container, 'x1').click();
			await expect.poll(() => shown(container)).not.toContain('f');
			expect(shown(container)).toContain('x2');
			// The line carries on past the fold to x2.
			expect(getComputedStyle(nodeOf(container, 'x1'), '::after').content).not.toBe('none');

			toggleOf(container, 'x').click();
			await expect.poll(() => shown(container)).not.toContain('x1');
			expect(getComputedStyle(nodeOf(container, 'x'), '::after').content).toBe('none');
			// The trunk is never folded.
			expect(shown(container)).toContain('y4');
		});

		it('keeps a revealed node on screen, and only what is in its way open', () => {
			const { container } = render(TreeHarness, { roots: TREE, trunk: true, reveal: ['f1'] });
			expect(toggleOf(container, 'x')).toBeDisabled();
			expect(toggleOf(container, 'x1')).toBeDisabled();
			expect(toggleOf(container, 'f')).toBeDisabled();
			expect(toggleOf(container, 'r')).toBeDisabled();
			// Folding elsewhere is still on offer.
			const { container: other } = render(TreeHarness, {
				roots: TREE,
				trunk: true,
				reveal: ['x3']
			});
			expect(toggleOf(other, 'x1')).toBeEnabled();
		});
	});
});
