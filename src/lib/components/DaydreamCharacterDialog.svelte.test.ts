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

type Details = HTMLElement & { open: boolean; summary: string };

function moreDetail(container: ParentNode): Details {
	const found = [...container.querySelectorAll<Details>('wa-details')].find(
		(candidate) => candidate.summary === 'More detail'
	);
	if (!found) {
		throw new Error('no More detail');
	}
	return found;
}

const SEALED = { recordId: 'x', vaultId: 'v', ciphertext: 'sb1.x', payloadVersion: 1 };

const PARTS = [
	{ id: 'p1', name: 'the interviewer', description: '', takenBy: null },
	{ id: 'p2', name: 'the observer', description: '', takenBy: 'Jun' }
];

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
			value: {
				fields: {
					personality: 'Something else',
					speech: 'Short sentences.',
					appearance: 'Grey suit.'
				},
				parts: []
			}
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
		// What it wrote is under "More detail", which opens to show it.
		expect(moreDetail(baseElement).open).toBe(true);
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

	it('keeps a starting point’s libido and kink, says them on it, and clears them', async () => {
		const onsaved = vi.fn();
		const { baseElement } = render(DaydreamCharacterDialog, {
			props: { context, suggestionsOn: false, onsaved, onclose: () => undefined }
		});
		await waSettled(baseElement);
		const sadist = button(baseElement, 'The sadist');
		expect(sadist?.querySelector('.level')?.textContent?.trim()).toBe('Horny · kinky');
		expect(button(baseElement, 'The best friend')?.querySelector('.level')?.textContent).toBe(
			'Chaste'
		);

		sadist?.click();
		await waitFor(() => expect(button(baseElement, 'Clear libido')).toBeDefined());
		await waSettled(baseElement);
		button(baseElement, 'Clear libido')?.click();
		await waitFor(() => expect(button(baseElement, 'Clear libido')).toBeUndefined());

		baseElement.querySelector<HTMLInputElement>('.save-to-library input')?.click();
		await waSettled(baseElement);
		button(baseElement, 'Add character')?.click();
		await waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(onsaved.mock.calls[0]?.[0]).toMatchObject({
			name: 'Corin',
			dials: { libido: null, kink: 5, edge: 5 }
		});
	});

	describe('more detail', () => {
		it('starts closed for a character described only up front', async () => {
			const { baseElement } = render(DaydreamCharacterDialog, {
				props: {
					character: testCharacter({ personality: 'Calm.' }),
					context,
					suggestionsOn: false,
					onsaved: () => undefined,
					onclose: () => undefined
				}
			});
			await waSettled(baseElement);
			expect(moreDetail(baseElement).open).toBe(false);
			// The broad strokes are in there too.
			expect(moreDetail(baseElement).querySelector('wa-slider')).not.toBeNull();
		});

		it('starts open for a character with something in it', async () => {
			const { baseElement } = render(DaydreamCharacterDialog, {
				props: {
					character: testCharacter({ appearance: 'Grey suit.' }),
					context,
					suggestionsOn: false,
					onsaved: () => undefined,
					onclose: () => undefined
				}
			});
			await waSettled(baseElement);
			expect(moreDetail(baseElement).open).toBe(true);
		});
	});

	describe('in this story', () => {
		it('is not there from the library', async () => {
			const { baseElement } = render(DaydreamCharacterDialog, {
				props: { context, suggestionsOn: false, onsaved: () => undefined, onclose: () => undefined }
			});
			await waSettled(baseElement);
			expect(baseElement.textContent).not.toContain('In this story');
			expect(baseElement.textContent).not.toContain('Who they are to you');
		});

		it('offers the scene’s parts, but not one someone else plays', async () => {
			const { baseElement } = render(DaydreamCharacterDialog, {
				props: {
					character: testCharacter(),
					casting: { value: { partId: 'p1', relationship: '', part: '' }, parts: PARTS },
					context,
					suggestionsOn: false,
					onsaved: () => undefined,
					onclose: () => undefined
				}
			});
			await waSettled(baseElement);
			expect(baseElement.textContent).toContain('In this story');
			const options = [
				...baseElement.querySelectorAll<HTMLElement & { disabled: boolean }>('wa-option')
			];
			expect(options.map((option) => option.textContent?.trim())).toEqual([
				'No particular part',
				'the interviewer',
				'the observer (Jun)'
			]);
			expect(options[2]?.disabled).toBe(true);
		});

		it('saves who they are to the library, and their part only to the daydream', async () => {
			client.saveLibraryItem.mockResolvedValue({ ok: true, revision: 0, sealed: SEALED });
			const onsaved = vi.fn();
			const { baseElement } = render(DaydreamCharacterDialog, {
				props: {
					character: testCharacter({ name: 'Mara' }),
					casting: {
						value: { partId: 'p1', relationship: 'your boss', part: 'testing you' },
						parts: PARTS
					},
					context,
					suggestionsOn: false,
					onsaved,
					onclose: () => undefined
				}
			});
			await waSettled(baseElement);
			// Ticked by hand: a copy kept only in a daydream starts unticked.
			const tick = baseElement.querySelector<HTMLInputElement>('.save-to-library input');
			tick?.click();
			await waSettled(baseElement);
			button(baseElement, 'Save changes')?.click();

			await waitFor(() => expect(onsaved).toHaveBeenCalled());
			const posted = client.saveLibraryItem.mock.calls[0]?.[1] as { content: object };
			expect(posted.content).not.toHaveProperty('casting');
			expect(posted.content).toMatchObject({ name: 'Mara' });
			expect(onsaved.mock.calls[0]?.[0]).toMatchObject({
				name: 'Mara',
				casting: { partId: 'p1', relationship: 'your boss', part: 'testing you' }
			});
		});

		it('writes their part into the empty fields when asked', async () => {
			const write = vi.fn().mockResolvedValue({
				ok: true,
				value: { relationship: 'your new boss', part: 'deciding if you stay' }
			});
			const { baseElement } = render(DaydreamCharacterDialog, {
				props: {
					character: testCharacter({ name: 'Mara', personality: 'Calm.' }),
					casting: {
						value: { partId: 'p1', relationship: 'your boss', part: '' },
						parts: PARTS,
						write
					},
					context,
					suggestionsOn: true,
					onsaved: () => undefined,
					onclose: () => undefined
				}
			});
			await waSettled(baseElement);
			button(baseElement, 'Write their part')?.click();

			await waitFor(() =>
				expect(textarea(baseElement, 'Their part in this').value).toBe('deciding if you stay')
			);
			// Never over what was written.
			expect(textarea(baseElement, 'Who they are to you').value).toBe('your boss');
			expect(write.mock.calls[0]?.[0]).toMatchObject({ name: 'Mara', personality: 'Calm.' });
			expect(write.mock.calls[0]?.[1]).toBe('p1');
		});
	});
});
