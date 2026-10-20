import { render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { MAX_DAYDREAM_CHARACTERS } from '$lib/daydream';
import { testIdea } from '$lib/testing/daydream-setup';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';
import { isClientId } from '$lib/vault';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const suggest = vi.hoisted(() => ({
	suggestChips: vi.fn(),
	suggestFill: vi.fn(),
	surpriseIdea: vi.fn()
}));
vi.mock('$lib/daydream/suggest', () => suggest);

const client = vi.hoisted(() => ({ saveLibraryItem: vi.fn() }));
vi.mock('$lib/daydream/client', () => client);

const { default: DaydreamIdeaDialog } = await import('./DaydreamIdeaDialog.svelte');

const context = { characters: [], limits: '' };
const SEALED = { recordId: 'x', vaultId: 'v', ciphertext: 'sb1.x', payloadVersion: 1 };

type Details = HTMLElement & { open: boolean; summary: string };

beforeEach(() => {
	suggest.suggestFill.mockReset();
	suggest.surpriseIdea.mockReset();
	client.saveLibraryItem.mockReset();
});

function button(container: ParentNode, text: string): HTMLElement | undefined {
	return [...container.querySelectorAll<HTMLElement>('wa-button')].find((candidate) =>
		candidate.textContent?.includes(text)
	);
}

function moreDetail(container: ParentNode): Details {
	// The property, which is what Svelte set on the upgraded element (AGENTS.md).
	const found = [...container.querySelectorAll<Details>('wa-details')].find(
		(candidate) => candidate.summary === 'More detail'
	);
	if (!found) {
		throw new Error('no More detail');
	}
	return found;
}

const partRows = (container: ParentNode) => [...container.querySelectorAll('.part')];

function renderDialog(props: Record<string, unknown> = {}) {
	return render(DaydreamIdeaDialog, {
		// Under `props`: a top-level `context` is read as Svelte's mount option.
		props: {
			context,
			suggestionsOn: false,
			onsaved: () => undefined,
			onclose: () => undefined,
			...props
		}
	});
}

describe('DaydreamIdeaDialog', () => {
	it('keeps the title, what it is about and the parts up front, and the rest closed', async () => {
		const { baseElement } = renderDialog();
		await waSettled(baseElement);
		expect(moreDetail(baseElement).open).toBe(false);
		const labels = [...moreDetail(baseElement).querySelectorAll('.chip-field .label')].map(
			(label) => label.textContent?.trim()
		);
		expect(labels).toEqual(['Where', 'Your part', 'Tone', 'Anything else']);
		expect(baseElement.textContent).toContain('Parts for characters');
	});

	it('asks a monologue for its sayings up front, in its own words for each field', async () => {
		const { baseElement } = renderDialog({ context: { ...context, narrator: 'monologue' } });
		await waSettled(baseElement);
		const all = [...baseElement.querySelectorAll('.chip-field .label')].map((label) =>
			label.textContent?.trim()
		);
		const detail = [...moreDetail(baseElement).querySelectorAll('.chip-field .label')].map(
			(label) => label.textContent?.trim()
		);
		expect(all.slice(0, 2)).toEqual(['What it’s about', 'Sayings to build on']);
		expect(detail).toEqual(['Where', 'Who you are to it', 'Tone']);
		expect(baseElement.textContent).toContain('What the voice believes, and keeps coming back to');
	});

	it('starts with more detail open for an idea that has some', async () => {
		const { baseElement } = renderDialog({ idea: testIdea({ setting: 'An empty office.' }) });
		await waSettled(baseElement);
		expect(moreDetail(baseElement).open).toBe(true);
	});

	it('shows where an idea came from under more detail, only for one that has it, and saves it', async () => {
		const detailLabels = (container: ParentNode) =>
			[...moreDetail(container).querySelectorAll('.chip-field .label')].map((label) =>
				label.textContent?.trim()
			);
		const handMade = renderDialog({ idea: testIdea() });
		await waSettled(handMade.baseElement);
		expect(detailLabels(handMade.baseElement)).not.toContain('What you asked for');
		handMade.unmount();

		const onsaved = vi.fn();
		const { baseElement } = renderDialog({
			idea: testIdea({ brief: 'a stranger on a night train', research: 'Trains at night.' }),
			onsaved
		});
		await waSettled(baseElement);
		expect(detailLabels(baseElement)).toEqual([
			'Where',
			'Your part',
			'Tone',
			'Anything else',
			'What you asked for',
			'Background'
		]);
		// Where it came from is nothing the user customised, so it opens nothing.
		expect(moreDetail(baseElement).open).toBe(false);

		moreDetail(baseElement).open = true;
		await waSettled(baseElement);
		const research = [...baseElement.querySelectorAll('.chip-field')]
			.find((field) => field.querySelector('.label')?.textContent?.trim() === 'Background')
			?.querySelector('textarea');
		await userEvent.type(defined(research, 'the research box'), ' Sleeper cars.');
		await waSettled(baseElement);
		button(baseElement, 'Save changes')?.click();
		await waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(onsaved.mock.calls[0]?.[0]).toMatchObject({
			brief: 'a stranger on a night train',
			research: 'Trains at night. Sleeper cars.'
		});
	});

	it('adds parts up to the cap, and removes them', async () => {
		const { baseElement } = renderDialog();
		await waSettled(baseElement);
		for (let count = 1; count <= MAX_DAYDREAM_CHARACTERS; count += 1) {
			button(baseElement, 'Add a part')?.click();
			await waitFor(() => expect(partRows(baseElement)).toHaveLength(count));
		}
		await waSettled(baseElement);
		expect(button(baseElement, 'Add a part')).toBeUndefined();

		const remove = partRows(baseElement)[0]?.querySelector('wa-button') as HTMLElement;
		remove.click();
		await waitFor(() => expect(partRows(baseElement)).toHaveLength(MAX_DAYDREAM_CHARACTERS - 1));
		expect(button(baseElement, 'Add a part')).toBeDefined();
	});

	it('gives a template’s parts ids of their own, and shows the detail it filled', async () => {
		client.saveLibraryItem.mockResolvedValue({ ok: true, revision: 0, sealed: SEALED });
		const onsaved = vi.fn();
		const { baseElement } = renderDialog({ onsaved });
		await waSettled(baseElement);
		button(baseElement, 'The facility')?.click();
		await waitFor(() => expect(partRows(baseElement)).toHaveLength(2));
		expect(moreDetail(baseElement).open).toBe(true);

		await waSettled(baseElement);
		button(baseElement, 'Use this idea')?.click();
		await waitFor(() => expect(onsaved).toHaveBeenCalled());
		const saved = defined(onsaved.mock.calls[0], 'the saved idea') as [
			{ parts: { id: string; name: string }[] }
		];
		const [{ parts }] = saved;
		expect(parts.map((part) => part.name)).toEqual(['the instructor', 'the observer']);
		expect(parts.every((part) => isClientId(part.id))).toBe(true);
		expect(new Set(parts.map((part) => part.id)).size).toBe(2);
	});

	it('saves a part as it was typed, trimmed', async () => {
		const onsaved = vi.fn();
		const { baseElement } = renderDialog({
			idea: testIdea({ title: 'Late', premise: 'A meeting.' }),
			onsaved
		});
		await waSettled(baseElement);
		button(baseElement, 'Add a part')?.click();
		await waitFor(() => expect(partRows(baseElement)).toHaveLength(1));
		await waSettled(baseElement);
		const name = partRows(baseElement)[0]
			?.querySelector('wa-input')
			?.shadowRoot?.querySelector('input') as HTMLInputElement;
		await userEvent.type(name, ' the boss ');
		await waSettled(baseElement);
		button(baseElement, 'Save changes')?.click();

		await waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(onsaved.mock.calls[0]?.[0]).toMatchObject({
			parts: [{ name: 'the boss', description: '' }]
		});
	});

	it('takes the model’s parts only for an idea that had none', async () => {
		suggest.suggestFill.mockResolvedValue({
			ok: true,
			value: {
				fields: { setting: 'A hotel bar.' },
				parts: [{ name: 'the stranger', description: '' }],
				ideaDials: { heat: null, kink: null }
			}
		});
		const { baseElement } = renderDialog({
			idea: testIdea({ title: 'Late', premise: 'A meeting.' }),
			suggestionsOn: true
		});
		await waSettled(baseElement);
		button(baseElement, 'Fill in the rest')?.click();
		await waitFor(() => expect(partRows(baseElement)).toHaveLength(1));
		expect(baseElement.querySelector<HTMLElement & { value: string }>('.part-name')?.value).toBe(
			'the stranger'
		);
		expect(moreDetail(baseElement).open).toBe(true);
	});

	it('says each starting point’s level on it, from SFW up', async () => {
		const { baseElement } = renderDialog();
		await waSettled(baseElement);
		const levels = [...baseElement.querySelectorAll('.template-list .level')].map((level) =>
			level.textContent?.trim()
		);
		expect(levels[0]).toBe('SFW');
		expect(levels.at(-1)).toBe('Filthy · kinky');
	});

	it('keeps a template’s heat and kink, which can be cleared', async () => {
		const onsaved = vi.fn();
		const { baseElement } = renderDialog({ onsaved });
		await waSettled(baseElement);
		button(baseElement, 'The dungeon')?.click();
		await waitFor(() => expect(button(baseElement, 'Clear heat')).toBeDefined());
		await waSettled(baseElement);
		button(baseElement, 'Clear kink')?.click();
		await waitFor(() => expect(button(baseElement, 'Clear kink')).toBeUndefined());

		const save = defined(
			baseElement.querySelector<HTMLInputElement>('.save-to-library input'),
			'the library box'
		);
		save.click();
		await waSettled(baseElement);
		button(baseElement, 'Use this idea')?.click();
		await waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(onsaved.mock.calls[0]?.[0]).toMatchObject({ dials: { heat: 5, kink: null } });
	});

	it('takes the model’s heat and kink only where they were unset', async () => {
		suggest.suggestFill.mockResolvedValue({
			ok: true,
			value: { fields: { setting: 'A hotel bar.' }, parts: [], ideaDials: { heat: 4, kink: 5 } }
		});
		const onsaved = vi.fn();
		const { baseElement } = renderDialog({
			idea: testIdea({ title: 'Late', premise: 'A meeting.', dials: { heat: null, kink: 2 } }),
			suggestionsOn: true,
			onsaved
		});
		await waSettled(baseElement);
		button(baseElement, 'Fill in the rest')?.click();
		await waitFor(() => expect(button(baseElement, 'Clear heat')).toBeDefined());
		expect(suggest.suggestFill.mock.calls[0]?.[0]).toMatchObject({
			ideaDials: { heat: null, kink: 2 }
		});
		await waSettled(baseElement);
		button(baseElement, 'Save changes')?.click();
		await waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(onsaved.mock.calls[0]?.[0]).toMatchObject({ dials: { heat: 4, kink: 2 } });
	});
});
