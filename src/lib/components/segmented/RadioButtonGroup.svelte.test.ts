import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { userEvent } from 'vitest/browser';
import { defined } from '$lib/testing/defined';
import RadioButtonGroupHarness from '$lib/testing/RadioButtonGroupHarness.svelte';

/** The pill, and where its sliding fill has been put. */
function fill(container: HTMLElement) {
	const pill = defined(container.querySelector<HTMLElement>('.segmented-pill'), 'the pill');
	const indicator = defined(pill.querySelector<HTMLElement>('.indicator'), 'the fill');
	return {
		pill,
		x: indicator.style.getPropertyValue('--x'),
		width: indicator.style.getPropertyValue('--width'),
		slides: pill.hasAttribute('data-slide'),
		measured: pill.hasAttribute('data-measured')
	};
}

/** Where the fill should be to cover an option. */
function boxOf(container: HTMLElement, value: string) {
	const option = defined(
		container.querySelector<HTMLElement>(`.segmented-pill [data-value="${value}"]`),
		`the ${value} option`
	);
	return { x: `${option.offsetLeft}px`, width: `${option.offsetWidth}px` };
}

describe('RadioButtonGroup, radio kind', () => {
	it('is a radiogroup named by its visible label, of native radios, the first checked', () => {
		render(RadioButtonGroupHarness);
		const group = screen.getByRole('radiogroup', { name: 'How many' });
		expect(group).toBeInTheDocument();
		expect(screen.getByText('How many')).toBeVisible();
		const radios = screen.getAllByRole('radio');
		expect(radios.map((radio) => radio.tagName)).toEqual(['INPUT', 'INPUT', 'INPUT']);
		expect(screen.getByRole('radio', { name: 'One' })).toBeChecked();
		expect(screen.getByRole('radio', { name: 'A good deal more than one 2' })).not.toBeChecked();
	});

	it('keeps a hidden label for screen readers only', () => {
		render(RadioButtonGroupHarness, { hideLabel: true });
		expect(screen.getByRole('radiogroup', { name: 'How many' })).toBeInTheDocument();
		expect(screen.queryByText('How many')).toBeNull();
	});

	it('follows a click into its bound value and onchange, and submits it with the form', async () => {
		const onchange = vi.fn();
		const { container } = render(RadioButtonGroupHarness, { onchange });
		screen.getByText('Three').click();
		await tick();
		expect(container.querySelector('output')).toHaveTextContent('three');
		expect(onchange).toHaveBeenCalledWith('three');
		const form = defined(container.querySelector('form'), 'the form');
		expect(new FormData(form).get('amount')).toBe('three');
	});

	it('moves with the arrow keys, as native radios do, skipping a disabled one', async () => {
		const { container } = render(RadioButtonGroupHarness, { disabled: true });
		screen.getByRole('radio', { name: 'One' }).focus();
		await userEvent.keyboard('{ArrowRight}');
		expect(container.querySelector('output')).toHaveTextContent('two');
		await userEvent.keyboard('{ArrowRight}');
		expect(container.querySelector('output')).toHaveTextContent('one');
		expect(screen.getByRole('radio', { name: 'Three' })).toBeDisabled();
	});

	it('takes a value set from outside', async () => {
		const { rerender } = render(RadioButtonGroupHarness, { value: 'one' });
		await rerender({ value: 'three' });
		expect(screen.getByRole('radio', { name: 'Three' })).toBeChecked();
	});
});

describe('RadioButtonGroup, the sliding fill', () => {
	it('starts on the chosen option, without sliding there', async () => {
		const { container } = render(RadioButtonGroupHarness);
		await tick();
		const placed = fill(container);
		expect(placed.measured).toBe(true);
		expect(placed.slides).toBe(false);
		expect({ x: placed.x, width: placed.width }).toEqual(boxOf(container, 'one'));
	});

	it('slides and resizes onto an option a person chooses', async () => {
		const { container } = render(RadioButtonGroupHarness);
		await tick();
		screen.getByText('A good deal more than one').click();
		await tick();
		const placed = fill(container);
		expect(placed.slides).toBe(true);
		expect({ x: placed.x, width: placed.width }).toEqual(boxOf(container, 'two'));
		expect(boxOf(container, 'two').width).not.toBe(boxOf(container, 'one').width);
	});

	it('jumps, rather than slides, to a value set from outside', async () => {
		const { container, rerender } = render(RadioButtonGroupHarness, { value: 'one' });
		await tick();
		await rerender({ value: 'two' });
		const placed = fill(container);
		expect(placed.slides).toBe(false);
		expect({ x: placed.x, width: placed.width }).toEqual(boxOf(container, 'two'));
	});

	it('stays on its option when a count changes the option widths', async () => {
		const { container, rerender } = render(RadioButtonGroupHarness, { value: 'three' });
		await tick();
		const before = fill(container).x;
		await rerender({ count: 123_456 });
		await expect.poll(() => fill(container).x).not.toBe(before);
		expect({ x: fill(container).x, width: fill(container).width }).toEqual(
			boxOf(container, 'three')
		);
	});

	it('with a continuity key, slides from the option the last one showed', async () => {
		const first = render(RadioButtonGroupHarness, { continuity: 'test-pages', value: 'one' });
		await tick();
		first.unmount();
		const { container } = render(RadioButtonGroupHarness, {
			continuity: 'test-pages',
			value: 'three'
		});
		await tick();
		const placed = fill(container);
		expect(placed.slides).toBe(true);
		expect({ x: placed.x, width: placed.width }).toEqual(boxOf(container, 'three'));
	});

	it('without one, a new group does not slide', async () => {
		const first = render(RadioButtonGroupHarness, { value: 'one' });
		await tick();
		first.unmount();
		const { container } = render(RadioButtonGroupHarness, { value: 'three' });
		await tick();
		expect(fill(container).slides).toBe(false);
	});
});

describe('RadioButtonGroup, tab kind', () => {
	it('renders tab buttons in a tablist, only the chosen one in the tab order', () => {
		render(RadioButtonGroupHarness, { kind: 'tab', hideLabel: true });
		expect(screen.getByRole('tablist', { name: 'How many' })).toBeInTheDocument();
		const [one, two] = screen.getAllByRole('tab');
		expect(one).toHaveAttribute('aria-selected', 'true');
		expect(one).toHaveAttribute('tabindex', '0');
		expect(two).toHaveAttribute('aria-selected', 'false');
		expect(two).toHaveAttribute('tabindex', '-1');
		expect(screen.queryAllByRole('radio')).toHaveLength(0);
	});

	it('wraps with the arrow keys, jumps with Home and End, and skips a disabled tab', async () => {
		render(RadioButtonGroupHarness, { kind: 'tab', disabled: true });
		const [one, two] = screen.getAllByRole('tab');
		one?.focus();
		await userEvent.keyboard('{ArrowLeft}');
		expect(two).toHaveFocus();
		expect(two).toHaveAttribute('aria-selected', 'true');
		await userEvent.keyboard('{ArrowRight}');
		expect(one).toHaveFocus();
		await userEvent.keyboard('{End}');
		expect(two).toHaveFocus();
		await userEvent.keyboard('{Home}');
		expect(one).toHaveFocus();
	});
});

describe('RadioButtonGroup, link kind', () => {
	it('is a named nav of links, the chosen one the current page', () => {
		render(RadioButtonGroupHarness, { kind: 'link', hideLabel: true, value: 'two' });
		const nav = screen.getByRole('navigation', { name: 'How many' });
		expect(nav.querySelectorAll('a')).toHaveLength(3);
		expect(screen.getByRole('link', { name: 'A good deal more than one 2' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		expect(screen.getByRole('link', { name: 'One' })).not.toHaveAttribute('aria-current');
	});
});
