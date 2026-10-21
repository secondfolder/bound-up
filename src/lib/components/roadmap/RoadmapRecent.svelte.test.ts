import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { recentlyShipped } from '$lib/roadmap';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: RoadmapRecent } = await import('./RoadmapRecent.svelte');

describe('RoadmapRecent', () => {
	it('lists the most recently shipped items, with when', () => {
		const { container } = render(RoadmapRecent);
		expect(screen.getByRole('heading', { name: 'Recently added' })).toBeInTheDocument();
		const shipped = recentlyShipped(4);
		expect(container.querySelectorAll('li')).toHaveLength(shipped.length);
		for (const { item } of shipped) {
			const link = screen.getByRole('link', { name: item.title });
			expect(link).toHaveAttribute('href', `/(public)/roadmap#${item.id}`);
		}
		// Any month: naming one here failed the first time something shipped in
		// the next month.
		expect(screen.getAllByText(/^[A-Z][a-z]+ \d{4}$/).length).toBeGreaterThan(0);
	});

	it('names a parent once over a run of its twigs, and labels their list with it', () => {
		const { container } = render(RoadmapRecent);
		const shipped = recentlyShipped(4);
		// Consecutive runs, as the component makes them.
		const runs = shipped.filter(
			(placed, index) => index === 0 || shipped[index - 1]?.parent?.id !== placed.parent?.id
		);
		expect(container.querySelectorAll('.run')).toHaveLength(runs.length);
		for (const parent of runs.flatMap((run) => (run.parent ? [run.parent] : []))) {
			expect(screen.getByRole('list', { name: parent.title })).toBeInTheDocument();
		}
	});
});
