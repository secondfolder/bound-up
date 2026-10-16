import { render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testCharacter } from '$lib/testing/daydream-setup';
import { waSettled } from '$lib/testing/web-awesome';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const suggest = vi.hoisted(() => ({
	suggestChips: vi.fn(),
	suggestFill: vi.fn(),
	surpriseScene: vi.fn()
}));
vi.mock('$lib/daydream/suggest', () => suggest);

const client = vi.hoisted(() => ({ saveLibraryItem: vi.fn() }));
vi.mock('$lib/daydream/client', () => client);

const { default: DaydreamCharacterDialog } = await import('./DaydreamCharacterDialog.svelte');

const context = { characters: [], limits: '' };

beforeEach(() => {
	suggest.suggestChips.mockReset();
	suggest.suggestFill.mockReset();
	client.saveLibraryItem.mockReset();
});

function textarea(container: ParentNode, label: string): HTMLTextAreaElement {
	const found = [...container.querySelectorAll('.chip-field')].find((field) =>
		field.querySelector('.label')?.textContent?.includes(label)
	);
	const area = found?.querySelector('textarea');
	if (!area) {
		throw new Error(`no ${label} field`);
	}
	return area;
}

function chip(container: ParentNode, text: string): HTMLButtonElement | undefined {
	return [...container.querySelectorAll<HTMLButtonElement>('button.chip')].find(
		(candidate) => candidate.textContent?.trim() === text
	);
}

function button(container: ParentNode, text: string): HTMLElement | undefined {
	return [...container.querySelectorAll<HTMLElement>('wa-button')].find((candidate) =>
		candidate.textContent?.includes(text)
	);
}

describe('DaydreamCharacterDialog', () => {
	it('toggles a chip in and out of the text, keeping what was written', async () => {
		const { baseElement } = render(DaydreamCharacterDialog, {
			// Under `props`: a top-level `context` is read as Svelte's mount option.
			props: {
				character: testCharacter({ personality: 'Watches everything.' }),
				context,
				suggestionsOn: false,
				onsaved: () => undefined,
				onclose: () => undefined
			}
		});
		await waSettled(baseElement);
		chip(baseElement, 'patient')?.click();
		await waitFor(() =>
			expect(textarea(baseElement, 'Personality').value).toBe('Watches everything., patient')
		);
		expect(chip(baseElement, 'patient')?.getAttribute('aria-pressed')).toBe('true');
		chip(baseElement, 'patient')?.click();
		await waitFor(() =>
			expect(textarea(baseElement, 'Personality').value).toBe('Watches everything.')
		);
	});

	it('fills in only the empty fields', async () => {
		suggest.suggestFill.mockResolvedValue({
			ok: true,
			value: { personality: 'Something else', speech: 'Short sentences.', appearance: 'Grey suit.' }
		});
		const { baseElement } = render(DaydreamCharacterDialog, {
			// Under `props`: a top-level `context` is read as Svelte's mount option.
			props: {
				character: testCharacter({ personality: 'Calm.' }),
				context,
				suggestionsOn: true,
				onsaved: () => undefined,
				onclose: () => undefined
			}
		});
		await waSettled(baseElement);
		button(baseElement, 'Fill in the rest')?.click();
		await waitFor(() =>
			expect(textarea(baseElement, 'How they talk').value).toBe('Short sentences.')
		);
		expect(textarea(baseElement, 'Appearance').value).toBe('Grey suit.');
		expect(textarea(baseElement, 'Personality').value).toBe('Calm.');
	});

	it('adds the model’s chips after the built-in ones with More ideas', async () => {
		suggest.suggestChips.mockResolvedValue({ ok: true, value: ['wry', 'patient'] });
		const { baseElement } = render(DaydreamCharacterDialog, {
			// Under `props`: a top-level `context` is read as Svelte's mount option.
			props: {
				context,
				suggestionsOn: true,
				onsaved: () => undefined,
				onclose: () => undefined
			}
		});
		await waSettled(baseElement);
		const field = [...baseElement.querySelectorAll('.chip-field')].find((each) =>
			each.querySelector('.label')?.textContent?.includes('Personality')
		) as HTMLElement;
		button(field, 'More ideas')?.click();
		await waitFor(() => expect(chip(field, 'wry')).toBeDefined());
		// Not offered twice.
		expect(
			[...field.querySelectorAll('button.chip')].filter(
				(each) => each.textContent?.trim() === 'patient'
			)
		).toHaveLength(1);
		expect(suggest.suggestChips.mock.calls[0]?.[0]).toMatchObject({
			target: 'character',
			field: 'personality'
		});
	});

	it('offers no model ideas when suggestions are off', async () => {
		const { baseElement } = render(DaydreamCharacterDialog, {
			// Under `props`: a top-level `context` is read as Svelte's mount option.
			props: {
				context,
				suggestionsOn: false,
				onsaved: () => undefined,
				onclose: () => undefined
			}
		});
		await waSettled(baseElement);
		expect(button(baseElement, 'More ideas')).toBeUndefined();
		expect(button(baseElement, 'Fill in the rest')).toBeUndefined();
		// The built-in ones are still there.
		expect(chip(baseElement, 'patient')).toBeDefined();
	});
});
