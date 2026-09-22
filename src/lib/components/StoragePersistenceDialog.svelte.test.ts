import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { waSettled } from '$lib/testing/web-awesome';
import {
	offerStorageExplanation,
	resetStorageExplanation,
	STORAGE_PERSISTENCE_ASKED_KEY
} from '$lib/crypto/storage-persistence.svelte';
import StoragePersistenceDialog from './StoragePersistenceDialog.svelte';

const TITLE = 'Keep your messages unlocked here';

let persist: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	resetStorageExplanation();
	localStorage.removeItem(STORAGE_PERSISTENCE_ASKED_KEY);
	vi.spyOn(navigator.storage, 'persisted').mockResolvedValue(false);
	persist = vi.spyOn(navigator.storage, 'persist').mockResolvedValue(true);
});

afterEach(() => {
	vi.restoreAllMocks();
	localStorage.removeItem(STORAGE_PERSISTENCE_ASKED_KEY);
});

async function renderDue() {
	const view = render(StoragePersistenceDialog);
	await offerStorageExplanation(true);
	await tick();
	await waSettled(view.container);
	return view;
}

describe('StoragePersistenceDialog', () => {
	test('says nothing until an unlock makes it due', () => {
		const { container } = render(StoragePersistenceDialog);
		expect(container.querySelector('wa-dialog')).toBeNull();
	});

	test('explains first, and asks the browser only on OK', async () => {
		const { container } = await renderDue();

		expect(container.querySelector('wa-dialog')).not.toBeNull();
		expect(persist).not.toHaveBeenCalled();

		screen.getByText('OK').click();
		await tick();

		expect(persist).toHaveBeenCalledTimes(1);
		expect(localStorage.getItem(STORAGE_PERSISTENCE_ASKED_KEY)).not.toBeNull();
		expect(container.querySelector('wa-dialog')).toBeNull();
	});

	test('closing it any other way asks nothing and records nothing', async () => {
		const { container } = await renderDue();

		// What Escape or the close button ends in, once the hide animation is done.
		container.querySelector('wa-dialog')!.dispatchEvent(new CustomEvent('wa-after-hide'));
		await tick();

		expect(container.querySelector('wa-dialog')).toBeNull();
		expect(persist).not.toHaveBeenCalled();
		expect(localStorage.getItem(STORAGE_PERSISTENCE_ASKED_KEY)).toBeNull();
	});

	test('has the title the user sees', async () => {
		const { container } = await renderDue();
		expect((container.querySelector('wa-dialog') as unknown as { label: string }).label).toBe(
			TITLE
		);
	});
});
