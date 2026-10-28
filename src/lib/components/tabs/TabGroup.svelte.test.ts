import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { userEvent } from 'vitest/browser';
import TabGroupHarness from '$lib/testing/TabGroupHarness.svelte';

describe('TabGroup', () => {
	it('is a named tab list, the first tab selected, with each count beside its label', () => {
		render(TabGroupHarness);
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
		expect(mine).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id);
	});

	it('switches on a click, keeping the other panel and what was typed in it', async () => {
		const { container } = render(TabGroupHarness);
		await userEvent.fill(screen.getByRole('textbox', { name: 'Kept' }), 'half an entry');
		screen.getByRole('tab', { name: 'For Jun 1' }).click();
		await tick();
		expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel theirs');
		expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);
		expect(container.querySelector('output')).toHaveTextContent('theirs');
		screen.getByRole('tab', { name: 'For you 3' }).click();
		await tick();
		expect(screen.getByRole('textbox', { name: 'Kept' })).toHaveValue('half an entry');
	});

	it('says which tab was left and which shown, in that order', async () => {
		const { container } = render(TabGroupHarness);
		screen.getByRole('tab', { name: 'For Jun 1' }).click();
		await tick();
		const events = [...container.querySelectorAll('li')].map((item) => item.textContent);
		expect(events).toEqual(['hide mine', 'show theirs']);
	});

	it('moves along with the arrow keys, wrapping, and takes focus with it', async () => {
		render(TabGroupHarness);
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

	it('shows the panel its bound value names, set from outside', async () => {
		const { rerender } = render(TabGroupHarness, { active: 'mine' });
		await rerender({ active: 'theirs' });
		expect(screen.getByRole('tab', { name: 'For Jun 1' })).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel theirs');
	});
});
