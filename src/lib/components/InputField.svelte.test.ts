import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import { defined } from '$lib/testing/defined';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import InputField from './InputField.svelte';

/**
 * A field outside a form, as a link to copy is shown: the form's own fields
 * are exercised through the forms that hold them (`PartnerAcceptForm`).
 */

const LINK = 'https://example.com/home/notebook/entry/menus/menu';

async function linkField(selectOnFocus: boolean) {
	const { container } = render(InputField, {
		type: 'text',
		title: 'Link to this menu',
		readonly: true,
		value: LINK,
		selectOnFocus
	});
	await waSettled(container);
	const host = defined(container.querySelector('wa-input'), 'the field');
	const control = defined(host.shadowRoot?.querySelector('input'), 'the native control');
	return { container, host, control };
}

describe('InputField outside a form', () => {
	it('shows the value it is given, under its label, with no error', async () => {
		const { container, host, control } = await linkField(false);
		expect(waProp(host, 'label')).toBe('Link to this menu');
		expect(control.value).toBe(LINK);
		expect(container.querySelector('.field-error')).toBeNull();
	});

	it('selects everything in it when clicked, with selectOnFocus', async () => {
		const { control } = await linkField(true);
		await userEvent.click(control);
		expect([control.selectionStart, control.selectionEnd]).toEqual([0, LINK.length]);

		// Again, once it has the focus: a click would otherwise place the
		// caret, a moment after the click's own listeners have run.
		await userEvent.click(control);
		await expect
			.poll(() => [control.selectionStart, control.selectionEnd])
			.toEqual([0, LINK.length]);
	});

	it('leaves the caret where it is clicked, without', async () => {
		const { control } = await linkField(false);
		await userEvent.click(control);
		expect(control.selectionStart).toBe(control.selectionEnd);
	});
});
