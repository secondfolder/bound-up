import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, onTestFinished } from 'vitest';
import { defined } from '$lib/testing/defined';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import SearchField from './SearchField.svelte';

async function renderField(props: { collapsible?: boolean; value?: string } = {}) {
	// Something else to move focus to, as a page would have.
	const elsewhere = document.createElement('button');
	document.body.append(elsewhere);
	onTestFinished(() => elsewhere.remove());
	const rendered = render(SearchField, {
		label: 'Search stories',
		placeholder: 'Title or tag',
		...props
	});
	await waSettled(rendered.container);
	const root = defined(rendered.container.querySelector<HTMLElement>('.search-field'), 'the field');
	const input = defined(
		root.querySelector<HTMLElement & { value: string }>('wa-input'),
		'its input'
	);
	const native = () => defined(input.shadowRoot?.querySelector('input'), 'the native input');
	const closed = () => root.classList.contains('closed');
	return { ...rendered, root, input, native, closed, elsewhere };
}

describe('SearchField', () => {
	it('is a labelled search box, open, when it is not collapsible', async () => {
		const { input, closed } = await renderField();
		expect(closed()).toBe(false);
		expect(waProp(input, 'label')).toBe('Search stories');
		expect(waProp(input, 'type')).toBe('search');
		expect(waProp(input, 'placeholder')).toBe('Title or tag');
	});

	it('rests closed when collapsible, with no placeholder showing, and opens on focus', async () => {
		const { input, native, closed, container } = await renderField({ collapsible: true });
		expect(closed()).toBe(true);
		expect(waProp(input, 'placeholder')).toBe('');
		native().focus();
		await waitFor(() => expect(closed()).toBe(false));
		await waSettled(container);
		expect(waProp(input, 'placeholder')).toBe('Title or tag');
	});

	it('closes as focus leaves while empty, and stays open with something in it', async () => {
		const { input, native, closed, elsewhere } = await renderField({ collapsible: true });
		native().focus();
		await waitFor(() => expect(closed()).toBe(false));
		input.value = 'brat';
		input.dispatchEvent(new Event('input'));
		elsewhere.focus();
		await new Promise((settle) => requestAnimationFrame(settle));
		expect(closed()).toBe(false);

		native().focus();
		input.value = '';
		input.dispatchEvent(new Event('input'));
		elsewhere.focus();
		await waitFor(() => expect(closed()).toBe(true));
	});

	it('starts open when it already has something in it', async () => {
		const { closed } = await renderField({ collapsible: true, value: 'brat' });
		expect(closed()).toBe(false);
	});

	it('empties on Escape, and closes on a second', async () => {
		const { input, native, closed } = await renderField({ collapsible: true, value: 'brat' });
		native().focus();
		native().dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })
		);
		await waitFor(() => expect(input.value).toBe(''));
		expect(closed()).toBe(false);
		native().dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })
		);
		await waitFor(() => expect(closed()).toBe(true));
	});
});
