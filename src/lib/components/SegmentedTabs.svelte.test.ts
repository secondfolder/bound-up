import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { userEvent } from 'vitest/browser';
import SegmentedTabsHarness from '$lib/testing/SegmentedTabsHarness.svelte';

describe('SegmentedTabs', () => {
	it('is a named tab list, the first tab selected, with each count beside its label', () => {
		render(SegmentedTabsHarness);
		expect(screen.getByRole('tablist', { name: 'Whose tasks' })).toBeInTheDocument();
		const [mine, theirs] = screen.getAllByRole('tab');
		expect(mine).toHaveAccessibleName('For you 3');
		expect(mine).toHaveAttribute('aria-selected', 'true');
		expect(theirs).toHaveAttribute('aria-selected', 'false');
		// Only the selected tab is in the tab order.
		expect(mine).toHaveAttribute('tabindex', '0');
		expect(theirs).toHaveAttribute('tabindex', '-1');
		expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel mine');
		expect(screen.getByRole('tabpanel')).toHaveAccessibleName('For you 3');
	});

	it('switches on a click, keeping the other panel in the page, hidden', async () => {
		const { container } = render(SegmentedTabsHarness);
		screen.getByRole('tab', { name: 'For Jun 1' }).click();
		await tick();
		expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel theirs');
		expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);
		expect(container.querySelector('output')).toHaveTextContent('theirs');
	});

	it('moves along with the arrow keys, wrapping, and takes focus with it', async () => {
		render(SegmentedTabsHarness);
		const [mine, theirs] = screen.getAllByRole('tab');
		mine?.focus();
		await userEvent.keyboard('{ArrowRight}');
		expect(theirs).toHaveAttribute('aria-selected', 'true');
		expect(theirs).toHaveFocus();
		await userEvent.keyboard('{ArrowRight}');
		expect(mine).toHaveAttribute('aria-selected', 'true');
		await userEvent.keyboard('{End}');
		expect(theirs).toHaveFocus();
	});
});
