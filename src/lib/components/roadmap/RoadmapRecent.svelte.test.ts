import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { recentlyShipped } from '$lib/roadmap';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: RoadmapRecent } = await import('./RoadmapRecent.svelte');

describe('RoadmapRecent', () => {
	it('lists the most recently shipped items, with when', () => {
		render(RoadmapRecent);
		expect(screen.getByRole('heading', { name: 'Recently added' })).toBeInTheDocument();
		const list = screen.getByRole('list', { name: 'Recently added' });
		const shipped = recentlyShipped(4);
		expect(list.querySelectorAll('li')).toHaveLength(shipped.length);
		for (const { item } of shipped) {
			const link = screen.getByRole('link', { name: new RegExp(`${item.title}$`) });
			expect(link).toHaveAttribute('href', `/(public)/roadmap#${item.id}`);
		}
		expect(screen.getAllByText('September 2026').length).toBeGreaterThan(0);
	});
});
