import { render, waitFor } from '@testing-library/svelte';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { expect, it as test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { daydreamSetupFormSchema, EMPTY_DAYDREAM_SETUP } from '$lib/schemas/daydreamForm';
import { waSettled } from '$lib/testing/web-awesome';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));
const client = vi.hoisted(() => ({ saveLibraryItem: vi.fn(), requestSuggestion: vi.fn() }));
vi.mock('$lib/daydream/client', () => client);
const { default: DaydreamSetupForm } = await import('./DaydreamSetupForm.svelte');

/**
 * A regression test, and a file of its own because it needs the client mocked.
 * The character dialog is an SPA superform, and superforms re-ran the page's
 * loads after its submit by default; the setup form underneath, whose empty
 * initial form is in `page.data` under the same id, was reset to it, so a
 * character made in the dialog was saved to the library and then vanished
 * from the daydream.
 */
test('keeps a character made in the dialog in the daydream being set up', async () => {
	client.saveLibraryItem.mockResolvedValue({
		ok: true,
		revision: 0,
		sealed: { recordId: 'x', vaultId: 'v', ciphertext: 'sb1.x', payloadVersion: 1 }
	});
	const setupForm = await superValidate(EMPTY_DAYDREAM_SETUP, zod4(daydreamSetupFormSchema), {
		errors: false
	});
	const { container, baseElement } = render(DaydreamSetupForm, {
		props: {
			setupForm,
			library: { characters: [], ideas: [] },
			suggestionsOn: false,
			submitLabel: 'Go'
		}
	});
	await waSettled(container);
	const dropdown = container.querySelector('wa-dropdown') as HTMLElement;
	const item = dropdown.querySelector('wa-dropdown-item') as HTMLElement;
	dropdown.dispatchEvent(new CustomEvent('wa-select', { detail: { item } }));
	await waitFor(() => expect(baseElement.querySelector('wa-dialog')).not.toBeNull());
	await waSettled(baseElement);
	const name = baseElement
		.querySelector('wa-dialog wa-input')
		?.shadowRoot?.querySelector('input') as HTMLInputElement;
	await userEvent.type(name, 'Mara');
	const submit = [...baseElement.querySelectorAll('wa-dialog wa-button')].find((b) =>
		b.textContent?.includes('Add character')
	) as HTMLElement;
	submit.click();
	await waitFor(() => expect(client.saveLibraryItem).toHaveBeenCalled());
	await waitFor(() => expect(container.querySelectorAll('wa-card')).toHaveLength(1));
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(container.querySelectorAll('wa-card')).toHaveLength(1);
	expect(container.querySelector('wa-card')?.textContent).toContain('Mara');
});
