import { render, waitFor } from '@testing-library/svelte';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { daydreamSetupFormSchema, EMPTY_DAYDREAM_SETUP } from '$lib/schemas/daydreamForm';
import type { DaydreamSetupContent } from '$lib/sealed-kinds/daydreams';
import { testCharacter, testDaydreamSetup } from '$lib/testing/daydream-setup';
import { waSettled } from '$lib/testing/web-awesome';
import type { DaydreamLibraryView, SealedRefView } from '$lib/types';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

/** What each library record opens to, by record id. */
const opened = vi.hoisted(() => new Map<string, unknown>());
vi.mock('$lib/sealed-views.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/sealed-views.svelte')>()),
	openedDaydreamCharacter: (sealed: SealedRefView) => opened.get(sealed.recordId),
	openedDaydreamScene: (sealed: SealedRefView) => opened.get(sealed.recordId)
}));

const { default: DaydreamSetupForm } = await import('./DaydreamSetupForm.svelte');

const EMPTY_LIBRARY: DaydreamLibraryView = { characters: [], scenes: [] };
const ref = (recordId: string): SealedRefView => ({
	recordId,
	vaultId: 'v',
	ciphertext: 'sb1.x',
	payloadVersion: 1
});

async function renderForm(
	options: {
		setup?: DaydreamSetupContent;
		library?: DaydreamLibraryView;
		suggestionsOn?: boolean;
	} = {}
) {
	const setupForm = await superValidate(EMPTY_DAYDREAM_SETUP, zod4(daydreamSetupFormSchema), {
		errors: false
	});
	const rendered = render(DaydreamSetupForm, {
		setupForm,
		daydream: options.setup ? { id: 'd1', revision: 0, setup: options.setup } : null,
		library: options.library ?? EMPTY_LIBRARY,
		suggestionsOn: options.suggestionsOn ?? false,
		submitLabel: 'Save setup'
	});
	await waSettled(rendered.container);
	return rendered;
}

/** Types one key at a time, giving the form's validation time to run between them. */
async function typeSlowly(field: Element, text: string) {
	for (const key of text) {
		await userEvent.type(field, key === ' ' ? '{Space}' : key);
		await new Promise((resolve) => setTimeout(resolve, 30));
	}
}

function button(container: HTMLElement, text: string): HTMLElement | undefined {
	return [...container.querySelectorAll<HTMLElement>('wa-button, button')].find((candidate) =>
		candidate.textContent?.includes(text)
	);
}

beforeEach(() => {
	opened.clear();
});

describe('DaydreamSetupForm', () => {
	/**
	 * A regression test. The form's schema once trimmed each field, and once
	 * the form is valid superforms writes the schema's parsed value back after
	 * each change, so every space was deleted a moment after it was typed:
	 * "The office" came out "Theoffice". It only shows with the rest of the
	 * form valid and typing paced like a person's, hence a full setup and both.
	 */
	it('keeps the spaces typed into the title and the limits', async () => {
		const { container } = await renderForm({ setup: testDaydreamSetup() });
		const title = container.querySelector('wa-input')?.shadowRoot?.querySelector('input');
		const limits = container.querySelector('textarea');
		if (!(title && limits)) {
			throw new Error('no title or limits field');
		}
		await userEvent.clear(title);
		await typeSlowly(title, 'Late at night');
		expect(title.value).toBe('Late at night');
		await typeSlowly(limits, 'Nothing in public');
		expect(limits.value).toBe('Nothing in public');
	});

	it('fills both settings from a preset, and disables what could never work with it', async () => {
		const { container } = await renderForm();
		button(container, 'Watch a story unfold')?.click();
		await waitFor(() =>
			expect(
				container.querySelector<HTMLInputElement>('input[value="third-person"]')?.checked
			).toBe(true)
		);
		expect(container.querySelector<HTMLInputElement>('input[value="absent"]')?.checked).toBe(true);
		// Watching rules out a story told to "you", and characters speaking to you.
		expect(
			container.querySelector<HTMLInputElement>('input[value="second-person"]')?.disabled
		).toBe(true);
		expect(container.querySelector<HTMLInputElement>('input[value="none"]')?.disabled).toBe(true);
		// Nobody to watch yet.
		expect(container.textContent).toContain('To watch, add at least one character');
		// And who leads means nothing when you are only watching.
		expect(container.textContent).not.toContain('Who leads');
	});

	it('needs no characters for a story told to you', async () => {
		const { container } = await renderForm();
		button(container, 'A story told to you')?.click();
		await waitFor(() =>
			expect(container.textContent).toContain('Optional: people the narrator brings in')
		);
		expect(container.textContent).not.toContain('add a character, or choose a narrator');
	});

	it('offers the library’s newer version of a character, and takes it on request', async () => {
		opened.set('c1', { ...testCharacter({ name: 'Mara', archetype: 'stricter now' }) });
		const setup = testDaydreamSetup({
			characters: [
				testCharacter({ name: 'Mara', archetype: 'strict', sourceId: 'c1', sourceRevision: 1 })
			]
		});
		const { container } = await renderForm({
			setup,
			library: {
				characters: [{ id: 'c1', revision: 2, updatedAt: new Date(), sealed: ref('c1') }],
				scenes: []
			}
		});
		expect(container.textContent).toContain('Updated in your library since.');
		button(container, 'Use the latest')?.click();
		await waitFor(() => expect(container.textContent).toContain('stricter now'));
		expect(container.textContent).not.toContain('Updated in your library since.');
	});

	it('offers to save a character kept only in this daydream', async () => {
		const { container } = await renderForm({ setup: testDaydreamSetup() });
		expect(container.textContent).toContain('Only in this daydream.');
		expect(button(container, 'Save to my characters')).toBeDefined();
	});

	it('offers Surprise me only when suggestions are on', async () => {
		const off = await renderForm();
		expect(button(off.container, 'Surprise me')).toBeUndefined();
		off.unmount();
		const on = await renderForm({ suggestionsOn: true });
		expect(button(on.container, 'Surprise me')).toBeDefined();
	});
});
