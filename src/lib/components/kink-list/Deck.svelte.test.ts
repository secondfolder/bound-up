import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import { categories } from '$lib/kink-list/catalog';
import { DeviceKinkList } from '$lib/kink-list/device-store.svelte';
import KinkListHarness from '$lib/testing/KinkListHarness.svelte';
import { waSettled } from '$lib/testing/web-awesome';

function freshStore(): DeviceKinkList {
	localStorage.clear();
	const store = new DeviceKinkList();
	store.open();
	return store;
}

/** A wa-button by its text: their roles are inside shadow roots, out of the role queries' reach. */
function waButton(container: HTMLElement, text: string): HTMLElement {
	const button = [...container.querySelectorAll('wa-button')].find(
		(candidate) => candidate.textContent?.replace(/\d/g, '').trim() === text
	);
	if (!button) {
		throw new Error(`no wa-button "${text}"`);
	}
	return button as HTMLElement;
}

async function renderDeck(store = freshStore()) {
	const ondone = vi.fn();
	const view = render(KinkListHarness, { store, deck: true, ondone });
	await waSettled(view.container);
	return { ...view, store, ondone };
}

describe('Deck', () => {
	it('answers the first card from its buttons, and moves on', async () => {
		const { container, store } = await renderDeck();
		expect(screen.getByRole('heading', { name: 'Romance and affection' })).toBeInTheDocument();
		waButton(container, 'Like').click();
		expect(store.list.answers.romance?.level).toBe('like');
		expect(await screen.findByRole('heading', { name: 'Kissing' })).toBeInTheDocument();
	});

	it('answers from the keyboard: a number, an arrow, Backspace to undo, S to skip', async () => {
		const { store } = await renderDeck();
		await userEvent.keyboard('7');
		expect(store.list.answers.romance?.level).toBe('love');
		await userEvent.keyboard('{ArrowLeft}');
		// Kissing has a role pair: an answer for both is the same answer on each side.
		expect(store.list.answers.kissing?.sides).toEqual({
			a: { level: 'not-for-me' },
			b: { level: 'not-for-me' }
		});
		await userEvent.keyboard('{Backspace}');
		expect(store.list.answers.kissing?.sides).toBeUndefined();
		expect(await screen.findByRole('heading', { name: 'Kissing' })).toBeInTheDocument();
		await userEvent.keyboard('s');
		expect(store.list.skipped.kissing?.skipped).toBe(true);
	});

	it('answers one side when one is picked, both otherwise', async () => {
		const { container, store } = await renderDeck();
		// Romance has no role pair; Kissing does.
		waButton(container, 'Like').click();
		await screen.findByRole('heading', { name: 'Kissing' });
		await userEvent.click(screen.getByRole('radio', { name: 'Receiving' }));
		waButton(container, 'Love').click();
		expect(store.list.answers.kissing).toMatchObject({ sides: { b: { level: 'love' } } });
		expect(store.list.answers.kissing?.level).toBeUndefined();
	});

	it('starts a leaning kink on your own side, once your side is set', async () => {
		const store = freshStore();
		store.list = {
			...store.list,
			settings: { ...store.list.settings, side: 'sub' },
			triage: Object.fromEntries(
				categories()
					.filter((category) => category.id !== 'impact')
					.map((category) => [category.id, { value: 'skip' as const, at: 1 }])
			)
		};
		const { container } = await renderDeck(store);
		expect(screen.getByRole('heading', { name: 'Spanking' })).toBeInTheDocument();
		expect(screen.getByRole('radio', { name: 'Receiving' })).toBeChecked();
		waButton(container, 'Love').click();
		expect(store.list.answers.spanking?.sides).toEqual({ b: { level: 'love' } });
	});

	it('holds a Conditional card for its note, then moves on', async () => {
		const { container, store } = await renderDeck();
		waButton(container, 'Conditional').click();
		await waSettled(container);
		const note = container.querySelector('wa-textarea') as HTMLElement & { value: string };
		expect(note).not.toBeNull();
		note.value = 'Only on holiday';
		note.dispatchEvent(new Event('input'));
		expect(store.list.answers.romance).toMatchObject({
			level: 'conditional',
			note: 'Only on holiday'
		});
		// Still on the same card until Next.
		expect(screen.getByRole('heading', { name: 'Romance and affection' })).toBeInTheDocument();
		waButton(container, 'Next').click();
		expect(await screen.findByRole('heading', { name: 'Kissing' })).toBeInTheDocument();
	});

	it('says it is done once every card is answered', async () => {
		const store = freshStore();
		// A handful of cards: every category but one skipped, and only the commonest shown.
		store.list = {
			...store.list,
			settings: { detail: 1, side: 'both', at: 1 },
			triage: Object.fromEntries(
				categories()
					.filter((category) => category.id !== 'intimacy')
					.map((category) => [category.id, { value: 'skip' as const, at: 1 }])
			)
		};
		const { ondone } = await renderDeck(store);
		for (let i = 0; i < 20 && ondone.mock.calls.length === 0; i += 1) {
			await userEvent.keyboard('6');
		}
		expect(ondone).toHaveBeenCalled();
	});
});
