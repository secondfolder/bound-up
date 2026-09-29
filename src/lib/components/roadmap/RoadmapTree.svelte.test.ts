import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { allItems, type RoadmapStatus, roadmap, STATUS_LABELS } from '$lib/roadmap';
import { defined } from '$lib/testing/defined';
// The app's palette: the dimmed lines mix toward --page-wash-floor, and the
// brand colours they are drawn in are overridden there too. Without it the
// dim colours are invalid and fall back to something that only looks right.
import '$lib/theme.css';
import RoadmapTree from './RoadmapTree.svelte';

describe('RoadmapTree', () => {
	it('renders every branch as a heading', () => {
		render(RoadmapTree, { branches: roadmap.branches });
		for (const branch of roadmap.branches) {
			expect(screen.getByRole('heading', { level: 2, name: branch.title })).toBeInTheDocument();
		}
	});

	it('renders every leaf and twig as a link to its own fragment', () => {
		const { container } = render(RoadmapTree, { branches: roadmap.branches });
		const links = [...container.querySelectorAll<HTMLAnchorElement>('a.node')];
		expect(links.map((link) => link.getAttribute('href'))).toEqual(
			allItems().map(({ item }) => `#${item.id}`)
		);
		// The fragment target is the link itself.
		for (const link of links) {
			expect(`#${link.id}`).toBe(link.getAttribute('href'));
		}
	});

	it('says each status in words, not only by the marker shape', () => {
		const { container } = render(RoadmapTree, { branches: roadmap.branches });
		for (const { item } of allItems()) {
			const link = container.querySelector(`a[id="${item.id}"]`);
			expect(link).toHaveTextContent(STATUS_LABELS[item.status]);
		}
	});

	it('gives every link a distinct accessible name', () => {
		render(RoadmapTree, { branches: roadmap.branches });
		const names = screen.getAllByRole('link').map((link) => link.textContent?.trim());
		expect(new Set(names).size).toBe(names.length);
	});

	it('dims the statuses it is told to hide, and only those', () => {
		const { container } = render(RoadmapTree, {
			branches: roadmap.branches,
			hidden: new Set(['planned'] as const)
		});
		for (const { item } of allItems()) {
			const link = container.querySelector(`a[id="${item.id}"]`);
			expect(link?.classList.contains('dimmed')).toBe(item.status === 'planned');
		}
	});

	describe('filtered by the legend', () => {
		const Dim = 0.3;

		/** How opaque something ends up on screen: its own opacity times every ancestor's. */
		function shown(element: Element): number {
			let opacity = 1;
			for (let at: Element | null = element; at; at = at.parentElement) {
				opacity *= Number(getComputedStyle(at).opacity);
			}
			return Math.round(opacity * 100) / 100;
		}

		/**
		 * The colours a line is drawn in, full and dimmed, resolved the way the
		 * tree resolves them: probes inside it, so they see its custom
		 * properties, and the browser formats all four alike.
		 */
		function palette(container: Element) {
			const tree = defined(container.querySelector('.tree'), 'the tree');
			const resolve = (token: string) => {
				const probe = document.createElement('span');
				probe.style.color = `var(${token})`;
				tree.append(probe);
				const colour = getComputedStyle(probe).color;
				probe.remove();
				return colour;
			};
			return {
				line: resolve('--line-color'),
				lineDim: resolve('--line-color-dim'),
				bark: resolve('--bark'),
				barkDim: resolve('--bark-dim')
			};
		}

		/** A connector's colour: whichever side it is drawn on. */
		function lineColour(element: Element, pseudo: '::before' | '::after'): string {
			const style = getComputedStyle(element, pseudo);
			return Number.parseFloat(style.borderLeftWidth) > 0
				? style.borderLeftColor
				: style.borderRightColor;
		}

		/** Every connector drawn on a pseudo-element, as [element, pseudo]. */
		function connectors(container: Element): [Element, '::before' | '::after'][] {
			return [...container.querySelectorAll('.leaves > li, .twigs > li, .node')].flatMap((part) =>
				(['::before', '::after'] as const)
					.filter((pseudo) => getComputedStyle(part, pseudo).content !== 'none')
					.map((pseudo): [Element, '::before' | '::after'] => [part, pseudo])
			);
		}

		function nodeOf(container: Element, id: string): Element {
			return defined(container.querySelector(`a.node[id="${id}"]`), `node ${id}`);
		}

		function itemOf(container: Element, id: string): Element {
			return defined(nodeOf(container, id).parentElement, `the item around ${id}`);
		}

		function renderHiding(...statuses: RoadmapStatus[]) {
			const rendered = render(RoadmapTree, {
				branches: roadmap.branches,
				hidden: new Set(statuses)
			});
			return { ...rendered, colours: palette(rendered.container) };
		}

		it('draws everything at one of just two levels, however much is hidden', () => {
			const filters: RoadmapStatus[][] = [
				['planned'],
				['in-progress'],
				['planned', 'exploring'],
				['in-progress', 'planned', 'exploring']
			];
			for (const filter of filters) {
				const { container, colours, unmount } = renderHiding(...filter);
				// The dim colour really is a different one.
				expect(colours.lineDim).not.toBe(colours.line);

				const levels = new Set<number>();
				for (const part of container.querySelectorAll(
					'.node > .marker-slot, .node > .text, .branch-icon, .branch-text'
				)) {
					levels.add(shown(part));
				}
				expect([...levels].toSorted(), filter.join(', ')).toEqual([Dim, 1]);

				// Every connector is drawn solid, in one of two colours, and
				// never made translucent on top — that is what compounded.
				const lines = new Set<string>();
				for (const [part, pseudo] of connectors(container)) {
					lines.add(lineColour(part, pseudo));
					expect(shown(part) * Number(getComputedStyle(part, pseudo).opacity)).toBe(1);
				}
				expect([...lines].toSorted(), filter.join(', ')).toEqual(
					[colours.line, colours.lineDim].toSorted()
				);
				unmount();
			}
		});

		it('draws a hidden stretch underneath the shown ones', () => {
			const { container, colours } = renderHiding('planned');
			const all = connectors(container);
			expect(all.length).toBeGreaterThan(100);
			for (const [part, pseudo] of all) {
				const dim = lineColour(part, pseudo) === colours.lineDim;
				expect(getComputedStyle(part, pseudo).zIndex).toBe(dim ? '-1' : 'auto');
			}
		});

		it('keeps the line into a hidden item whose twigs are shown', () => {
			// Hiding "in progress" hides Edging and one of its twigs, but not
			// the rest of its twigs, which reach the trunk through Edging.
			const { container, colours } = renderHiding('in-progress');
			const edging = nodeOf(container, 'edging');
			expect(shown(defined(edging.querySelector('.marker-slot'), 'a marker'))).toBe(Dim);
			expect(shown(defined(edging.querySelector('.text'), 'the text'))).toBe(Dim);
			expect(lineColour(edging, '::before')).toBe(colours.line); // the elbow into it
			expect(lineColour(itemOf(container, 'edging'), '::before')).toBe(colours.line); // the line down
			expect(lineColour(edging, '::after')).toBe(colours.line); // the stem on to its twigs

			// A hidden twig with shown twigs after it: its elbow dims, but the
			// line past it does not.
			const guided = nodeOf(container, 'guided-sessions');
			expect(lineColour(guided, '::before')).toBe(colours.lineDim);
			expect(lineColour(itemOf(container, 'guided-sessions'), '::before')).toBe(colours.line);
			expect(lineColour(itemOf(container, 'guided-sessions'), '::after')).toBe(colours.line);
		});

		it('dims a line that leads only to hidden items, and a branch with nothing shown', () => {
			const { container, colours } = renderHiding('in-progress', 'planned', 'exploring');
			// Chastity and both of its twigs are planned.
			const chastity = nodeOf(container, 'chastity');
			expect(lineColour(chastity, '::before')).toBe(colours.lineDim);
			expect(lineColour(chastity, '::after')).toBe(colours.lineDim);

			// Sessions has nothing shipped, so nothing in it is shown.
			const sessions = defined(container.querySelector('[id="sessions"]'), 'the Sessions head');
			expect(shown(defined(sessions.querySelector('.branch-icon'), 'an icon'))).toBe(Dim);
			expect(getComputedStyle(sessions, '::before').backgroundColor).toBe(colours.barkDim);
			expect(getComputedStyle(sessions, '::before').zIndex).toBe('-1');
			expect(lineColour(sessions, '::after')).toBe(colours.lineDim);

			// Partners has shipped items, so its head stays.
			const partners = defined(container.querySelector('[id="partners"]'), 'the Partners head');
			expect(shown(defined(partners.querySelector('.branch-icon'), 'an icon'))).toBe(1);
			expect(getComputedStyle(partners, '::before').backgroundColor).toBe(colours.bark);
			expect(lineColour(partners, '::after')).toBe(colours.line);
		});
	});

	/*
	 * The picture itself. The test frame is 1280px wide, so this is the wide
	 * layout: boughs either side of a centred trunk, packed by the component.
	 * Each check is one that has failed before — Web Awesome's native styles
	 * indent every `li` by 1.125em, which left the right-hand boughs 18px short
	 * of the trunk and every leaf line 18px off its icon.
	 */
	describe('drawn on a wide screen', () => {
		async function renderPacked() {
			const { container } = render(RoadmapTree, { branches: roadmap.branches });
			await vi.waitFor(() => {
				if (!container.querySelector('.trunk.packed')) {
					throw new Error('the boughs were never packed');
				}
			});
			const trunk = defined(container.querySelector<HTMLElement>('.trunk'), 'the trunk');
			const boughs = [...container.querySelectorAll<HTMLElement>('.bough')];
			return { trunk, boughs };
		}

		function px(value: string): number {
			return Number.parseFloat(value);
		}

		function centreX(el: Element): number {
			const box = el.getBoundingClientRect();
			return box.left + box.width / 2;
		}

		it('spaces the boughs on each side of the trunk evenly', async () => {
			const { trunk, boughs } = await renderPacked();
			const gap = px(getComputedStyle(trunk).rowGap);
			expect(gap).toBeGreaterThan(0);
			for (const side of ['start', 'end']) {
				const boxes = boughs
					.filter((bough) => bough.dataset.side === side)
					.map((bough) => bough.getBoundingClientRect());
				expect(boxes.length).toBeGreaterThan(1);
				for (let i = 1; i < boxes.length; i += 1) {
					expect(boxes[i].top - boxes[i - 1].bottom).toBeCloseTo(gap, 0);
				}
			}
		});

		it('keeps the branches in reading order down the trunk', async () => {
			const { boughs } = await renderPacked();
			const tops = boughs.map((bough) => bough.getBoundingClientRect().top);
			expect(tops).toEqual(tops.toSorted((a, b) => a - b));
		});

		it('joins every bough to the trunk', async () => {
			const { trunk, boughs } = await renderPacked();
			const trunkX = centreX(trunk);
			for (const bough of boughs) {
				const head = defined(bough.querySelector('.branch-head'), 'a branch head');
				const box = head.getBoundingClientRect();
				const reach = px(getComputedStyle(head, '::before').width);
				const end = bough.dataset.side === 'start' ? box.right + reach : box.left - reach;
				expect(end).toBeCloseTo(trunkX, 0);
			}
		});

		it('ends every elbow on the edge of the marker it leads to', async () => {
			const { boughs } = await renderPacked();
			for (const bough of boughs) {
				const mirrored = bough.dataset.side === 'start';
				for (const item of bough.querySelectorAll<HTMLElement>('.leaves > li, .twigs > li')) {
					const marker = defined(
						item.querySelector(':scope > .node .marker'),
						'the marker an elbow leads to'
					);
					// The bend and the run across are the node's ::before, starting
					// on the item's line and ending on the marker.
					const node = defined(item.querySelector(':scope > .node'), 'a node');
					const elbow = getComputedStyle(node, '::before');
					const nodeBox = node.getBoundingClientRect();
					const itemBox = item.getBoundingClientRect();
					const markerBox = marker.getBoundingClientRect();
					// Mirrored, everything runs right to left: measure from the
					// right-hand edges, as distances inward.
					const outer = mirrored ? nodeBox.right - px(elbow.right) : nodeBox.left + px(elbow.left);
					const inner = mirrored ? outer - px(elbow.width) : outer + px(elbow.width);
					expect(outer).toBeCloseTo(mirrored ? itemBox.right : itemBox.left, 0);
					expect(inner).toBeCloseTo(mirrored ? markerBox.right : markerBox.left, 0);
				}
			}
		});

		it('draws every marker over the elbow that meets it', async () => {
			// Touching is not enough: an elbow drawn on top covered the ring's
			// edge on every node without twigs. So at the point where the two
			// meet, the marker has to be what is on top.
			const { boughs } = await renderPacked();
			for (const bough of boughs) {
				const mirrored = bough.dataset.side === 'start';
				for (const marker of bough.querySelectorAll<HTMLElement>('.node .marker')) {
					marker.scrollIntoView({ block: 'center' });
					const box = marker.getBoundingClientRect();
					const x = mirrored ? box.right - 1 : box.left + 1;
					const hit = document.elementFromPoint(x, box.top + box.height / 2);
					expect(hit === marker || marker.contains(hit)).toBe(true);
				}
			}
		});

		it('runs each branch stem from its icon to the start of its leaves', async () => {
			const { boughs } = await renderPacked();
			for (const bough of boughs) {
				const head = defined(bough.querySelector('.branch-head'), 'a branch head');
				const icon = defined(bough.querySelector('.branch-icon'), 'a branch icon');
				const stem = getComputedStyle(head, '::after');
				const headBox = head.getBoundingClientRect();
				const iconBox = icon.getBoundingClientRect();
				expect(headBox.top + px(stem.top)).toBeCloseTo(iconBox.bottom, 0);
				// A pixel past the head, overlapping the first leaf's line so the
				// join has no seam.
				expect(headBox.top + px(stem.top) + px(stem.height)).toBeCloseTo(headBox.bottom + 1, 0);

				// And the leaves' line runs down the middle of the icon.
				const leaf = defined(bough.querySelector('.leaves > li'), 'a leaf');
				const leafBox = leaf.getBoundingClientRect();
				const line =
					px(getComputedStyle(leaf, '::before').borderInlineStartWidth) ||
					px(getComputedStyle(leaf, '::before').borderInlineEndWidth);
				const lineX =
					bough.dataset.side === 'start' ? leafBox.right - line / 2 : leafBox.left + line / 2;
				expect(lineX).toBeCloseTo(centreX(icon), 0);
			}
		});

		it("runs each leaf stem from its marker to its first twig, down the marker's middle", async () => {
			const { boughs } = await renderPacked();
			for (const bough of boughs) {
				for (const leaf of bough.querySelectorAll('.leaves > li:has(> .twigs)')) {
					const node = defined(leaf.querySelector(':scope > .node'), 'a leaf node');
					const marker = defined(node.querySelector('.marker'), 'a marker');
					const stem = getComputedStyle(node, '::after');
					const nodeBox = node.getBoundingClientRect();
					expect(nodeBox.top + px(stem.top)).toBeCloseTo(marker.getBoundingClientRect().bottom, 0);
					// A pixel past the node, overlapping the first twig's line.
					expect(nodeBox.top + px(stem.top) + px(stem.height)).toBeCloseTo(nodeBox.bottom + 1, 0);

					const twig = defined(leaf.querySelector('.twigs > li'), 'a twig');
					const twigBox = twig.getBoundingClientRect();
					const lineX = bough.dataset.side === 'start' ? twigBox.right - 1 : twigBox.left + 1;
					expect(lineX).toBeCloseTo(centreX(marker), 0);
				}
			}
		});
	});
});
