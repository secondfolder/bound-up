import { render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { describe, expect, test } from 'vitest';
import SectionWidgetHarness from './SectionWidgetHarness.svelte';

/**
 * These assert on the markup the component emits, which is the part that
 * decides the accessible name and the SSR shape. How the card looks is the
 * Playwright suite's problem.
 */
describe('SectionWidget', () => {
	test('links the title when it has somewhere to go', () => {
		render(SectionWidgetHarness, { title: 'Tasks', href: '/home/tasks', body: 'two ready' });

		// The bare word, not "Tasks chevron-right": the chevron carries no label,
		// so it contributes nothing. The e2e suite locates these cards by exactly
		// this name, which the wa-buttons they replaced also had.
		const link = screen.getByRole('link', { name: 'Tasks' });
		expect(link).toHaveAttribute('href', '/home/tasks');
		expect(screen.getByRole('heading', { level: 2 })).toContainElement(link);
	});

	test('leaves the title unlinked when there is nowhere to go', () => {
		render(SectionWidgetHarness, { title: 'Messages', body: 'two waiting' });

		expect(screen.queryByRole('link')).not.toBeInTheDocument();
		expect(screen.getByRole('heading', { level: 2, name: 'Messages' })).toBeInTheDocument();
	});

	test('sets with-header, without which wa-card server-renders only the body', () => {
		const { container } = render(SectionWidgetHarness, { title: 'Guides', body: 'nothing' });

		expect(container.querySelector('wa-card')).toHaveAttribute('with-header');
	});

	test('renders the body it is given', () => {
		render(SectionWidgetHarness, { title: 'Guides', body: 'three guides' });

		expect(screen.getByText('three guides')).toBeInTheDocument();
	});
});
