import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import { DeviceKinkList } from '$lib/kink-list/device-store.svelte';
import KinkListHarness from '$lib/testing/KinkListHarness.svelte';
import { waSettled } from '$lib/testing/web-awesome';

function storeWith(answers: DeviceKinkList['list']['answers'] = {}): DeviceKinkList {
	localStorage.clear();
	const store = new DeviceKinkList();
	store.open();
	store.list = { ...store.list, answers };
	return store;
}

describe('KinkRow', () => {
	it('answers a kink on the scale, and clears it again', async () => {
		const store = storeWith();
		const { container } = render(KinkListHarness, { store, itemKey: 'spanking' });
		const scale = screen.getByRole('group', { name: 'Spanking' });
		await userEvent.click(within(scale).getByRole('radio', { name: 'Like' }));
		expect(store.list.answers.spanking?.level).toBe('like');
		expect(within(scale).getByRole('radio', { name: 'Like' })).toBeChecked();

		// A wa-button: its role is inside its shadow root, out of the role queries' reach.
		await waSettled(container);
		(scale.querySelector('wa-button') as HTMLElement).click();
		expect(store.list.answers.spanking?.level).toBeUndefined();
	});

	it('shows a specific its kink’s answer, outlined and named, until it has its own', async () => {
		const store = storeWith({ spanking: { level: 'love', at: 1 } });
		render(KinkListHarness, { store, itemKey: 'spanking' });
		await userEvent.click(screen.getByRole('button', { name: /Get specific/ }));
		const specific = screen.getByRole('group', { name: 'Spanking with an implement' });
		// Inherited is not chosen: nothing in the group is checked.
		expect(within(specific).queryByRole('radio', { checked: true })).toBeNull();
		expect(screen.getByText('Love, from Spanking')).toBeInTheDocument();
	});

	it('answers each side of a role pair separately once asked to', async () => {
		const store = storeWith({ spanking: { level: 'like', at: 1 } });
		const { container } = render(KinkListHarness, { store, itemKey: 'spanking' });
		await userEvent.click(screen.getByRole('button', { name: /More detail and notes/ }));
		await waSettled(container);
		const toggle = container.querySelector('wa-switch') as HTMLElement & { checked: boolean };
		toggle.checked = true;
		toggle.dispatchEvent(new Event('change'));
		// Both sides start from the answer as it was.
		expect(store.list.answers.spanking?.sides).toEqual({
			a: { level: 'like', detail: undefined },
			b: { level: 'like', detail: undefined }
		});
		const receiving = await screen.findByRole('group', { name: 'Spanking, receiving' });
		await userEvent.click(within(receiving).getByRole('radio', { name: 'Hard limit' }));
		expect(store.list.answers.spanking?.sides?.b?.level).toBe('limit');
		expect(store.list.answers.spanking?.sides?.a?.level).toBe('like');
	});

	it('keeps a note typed against a kink', async () => {
		const store = storeWith();
		const { container } = render(KinkListHarness, { store, itemKey: 'spanking' });
		await userEvent.click(screen.getByRole('button', { name: /More detail and notes/ }));
		await waSettled(container);
		const note = container.querySelector('wa-textarea') as HTMLElement & { value: string };
		note.value = 'Only over the knee';
		note.dispatchEvent(new Event('input'));
		expect(store.list.answers.spanking?.note).toBe('Only over the knee');
	});
});

describe('KinkCategory', () => {
	it('lists related kinks behind a button, sharing their answer with their own category', async () => {
		const store = storeWith();
		render(KinkListHarness, { store, categoryId: 'anal' });
		expect(screen.queryByRole('group', { name: 'Rimming' })).toBeNull();
		await userEvent.click(screen.getByRole('button', { name: /related kinks/ }));
		const rimming = screen.getByRole('group', { name: 'Rimming' });
		await userEvent.click(within(rimming).getByRole('radio', { name: 'Love' }));
		// One answer, under the kink's own key, wherever it was given.
		expect(store.list.answers.rimming?.level).toBe('love');
	});

	it('hides kinks above the intensity setting, and says how many', () => {
		const store = storeWith();
		store.list = { ...store.list, settings: { maxIntensity: 1, at: 1 } };
		render(KinkListHarness, { store, categoryId: 'impact' });
		expect(screen.queryByRole('group', { name: 'Caning' })).toBeNull();
		expect(screen.getByText(/above your intensity setting/)).toBeInTheDocument();
	});
});
