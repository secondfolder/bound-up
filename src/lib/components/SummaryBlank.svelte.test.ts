import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import SummaryBlankHarness from '$lib/testing/SummaryBlankHarness.svelte';
import { waSettled } from '$lib/testing/web-awesome';

async function renderBlank(props: { menu?: boolean; onclick?: () => void } = {}) {
	const rendered = render(SummaryBlankHarness, { menu: false, ...props });
	await waSettled(rendered.container);
	const words = rendered.container.querySelector<HTMLElement>('.blank .words');
	const control = rendered.container.querySelector<HTMLButtonElement>('.blank button');
	if (!(words && control)) {
		throw new Error('no blank');
	}
	return { ...rendered, words, control };
}

describe('SummaryBlank', () => {
	it('is one button to assistive tech, named with its words, which are hidden from it', async () => {
		const { words, control, getByRole } = await renderBlank();
		expect(words.getAttribute('aria-hidden')).toBe('true');
		expect(control.textContent).toBe('');
		expect(getByRole('button', { name: 'the night train' })).toBe(control);
	});

	it('passes a press on its words to the button, and the keyboard reaches the button', async () => {
		const onclick = vi.fn();
		const { words, control } = await renderBlank({ onclick });
		await userEvent.click(words);
		expect(onclick).toHaveBeenCalledTimes(1);
		control.focus();
		await userEvent.keyboard('{Enter}');
		expect(onclick).toHaveBeenCalledTimes(2);
	});

	it('takes a tap inside a selection as a press, and a drag across its words as selecting them', async () => {
		const onclick = vi.fn();
		const { words, container } = await renderBlank({ onclick });
		const range = document.createRange();
		range.selectNodeContents(container);
		document.getSelection()?.removeAllRanges();
		document.getSelection()?.addRange(range);
		await userEvent.click(words);
		expect(onclick).toHaveBeenCalledTimes(1);

		const box = words.getBoundingClientRect();
		const at = (x: number) => ({
			clientX: box.left + x,
			clientY: box.top + box.height / 2,
			bubbles: true
		});
		words.dispatchEvent(new PointerEvent('pointerdown', at(2)));
		words.dispatchEvent(new MouseEvent('click', { ...at(60), detail: 1 }));
		expect(onclick).toHaveBeenCalledTimes(1);
		words.dispatchEvent(new PointerEvent('pointerdown', at(2)));
		words.dispatchEvent(new MouseEvent('click', { ...at(2), detail: 2 }));
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	it('keeps its words when the sentence around it is selected and copied', async () => {
		const { container } = await renderBlank({ menu: true });
		const sentence = container.querySelector('p');
		if (!sentence) {
			throw new Error('no sentence');
		}
		const range = document.createRange();
		range.selectNodeContents(sentence);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		// The closed menu's items are not part of what is read.
		expect(selection?.toString()).toBe('You ride the night train home.');
	});

	it('sits its button over its words, so a menu opens from them, and opens and closes it from them', async () => {
		const { words, control, container } = await renderBlank({ menu: true });
		const shown = words.getBoundingClientRect();
		const over = control.getBoundingClientRect();
		expect(Math.abs(over.left - shown.left)).toBeLessThan(1);
		expect(Math.abs(over.top - shown.top)).toBeLessThan(1);
		expect(Math.abs(over.width - shown.width)).toBeLessThan(1);

		const dropdown = container.querySelector('wa-dropdown') as HTMLElement & { open: boolean };
		await userEvent.click(words);
		await waitFor(() => expect(dropdown.open).toBe(true));
		expect(control.getAttribute('aria-expanded')).toBe('true');
		await userEvent.click(words);
		await waitFor(() => expect(dropdown.open).toBe(false));
	});
});
