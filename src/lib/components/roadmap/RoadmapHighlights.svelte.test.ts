import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { featuredUpcoming, recentlyShipped } from '$lib/roadmap';
import { defined } from '$lib/testing/defined';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: RoadmapHighlights } = await import('./RoadmapHighlights.svelte');

describe('RoadmapHighlights', () => {
	it('links each featured upcoming item to its node on the roadmap', () => {
		render(RoadmapHighlights);
		for (const { item } of featuredUpcoming(6)) {
			const link = screen.getByRole('link', { name: new RegExp(`^${item.title}`) });
			expect(link).toHaveAttribute('href', `/(public)/roadmap#${item.id}`);
		}
	});

	it('leaves what has shipped to RoadmapRecent', () => {
		render(RoadmapHighlights);
		expect(screen.queryByRole('heading', { name: 'Recently added' })).not.toBeInTheDocument();
		for (const { item } of recentlyShipped(4)) {
			expect(screen.queryByRole('link', { name: new RegExp(`${item.title}$`) })).toBeNull();
		}
	});

	it('links to the full roadmap', () => {
		render(RoadmapHighlights);
		expect(screen.getByRole('link', { name: 'See the full roadmap' })).toHaveAttribute(
			'href',
			'/(public)/roadmap'
		);
	});

	it('lays the tiles out evenly, with a short last row centred', () => {
		const { container } = render(RoadmapHighlights);
		const list = defined(container.querySelector('.upcoming'), 'the tile list');
		const tiles = [...container.querySelectorAll('.upcoming > li')].map((li) =>
			li.getBoundingClientRect()
		);
		const gap = Number.parseFloat(getComputedStyle(list).columnGap);
		expect(Number.parseFloat(getComputedStyle(list).rowGap)).toBe(gap);

		// Every tile is one column wide.
		for (const tile of tiles) {
			expect(tile.width).toBeCloseTo(tiles[0].width, 1);
		}

		const rows = Map.groupBy(tiles, (tile) => Math.round(tile.top));
		const rowList = [...rows.values()];
		// The frame is wide enough for a full row and a short one.
		expect(rowList.length).toBeGreaterThan(1);
		expect(rowList.at(-1)?.length).toBeLessThan(rowList[0].length);

		const listBox = list.getBoundingClientRect();
		for (const [index, row] of rowList.entries()) {
			for (let i = 1; i < row.length; i += 1) {
				expect(row[i].left - row[i - 1].right).toBeCloseTo(gap, 1);
			}
			// Centred, full rows and the short one alike.
			const first = defined(row[0], 'a tile');
			const last = defined(row.at(-1), 'a tile');
			expect(first.left - listBox.left).toBeCloseTo(listBox.right - last.right, 1);
			// The first row's "row above" is itself, so the check is skipped
			// by comparing a row to the one before it from the second on.
			const above = rowList[Math.max(index - 1, 0)] ?? row;
			const bottom = Math.max(...above.map((tile) => tile.bottom));
			expect(index === 0 ? gap : first.top - bottom).toBeCloseTo(gap, 1);
		}
	});

	it('gives every link a distinct accessible name', () => {
		render(RoadmapHighlights);
		const names = screen.getAllByRole('link').map((link) => link.textContent?.trim());
		expect(new Set(names).size).toBe(names.length);
	});
});
