import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { DAYDREAM_IDEA_CHIPS, DAYDREAM_STARTERS, startersFor } from '$lib/daydream/starters';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import DaydreamStarter from './DaydreamStarter.svelte';

/** Three of them, as if drawn by the page's load. */
const ideas = DAYDREAM_IDEA_CHIPS.slice(2, 5);

async function renderStarter(
	props: { suggestionsOn?: boolean; idea?: string; problem?: string } = {}
) {
	const handlers = { ondescribe: vi.fn(), onstarter: vi.fn(), onblank: vi.fn() };
	const rendered = render(DaydreamStarter, {
		idea: props.idea ?? '',
		ideas,
		side: null,
		suggestionsOn: props.suggestionsOn ?? true,
		asking: false,
		problem: props.problem ?? null,
		...handlers
	});
	await waSettled(rendered.container);
	return { ...rendered, ...handlers };
}

function button(container: HTMLElement, text: string): HTMLElement | undefined {
	return [...container.querySelectorAll<HTMLElement>('wa-button, button')].find((candidate) =>
		candidate.textContent?.includes(text)
	);
}

describe('DaydreamStarter', () => {
	it('offers every ready-made story, with its level and how it is told', async () => {
		const { container, onstarter } = await renderStarter();
		const cards = [...container.querySelectorAll<HTMLElement>('.card')];
		expect(cards).toHaveLength(DAYDREAM_STARTERS.length);
		expect(cards[0]?.textContent).toContain('Only one bed');
		expect(cards[0]?.textContent).toContain('SFW');
		expect(cards[0]?.textContent).toContain('Talk with a character');
		const tags = [...(cards[0]?.querySelectorAll('.tag') ?? [])].map((tag) => tag.textContent);
		expect(tags).toEqual(DAYDREAM_STARTERS[0]?.tags);
		cards[0]?.click();
		expect(onstarter).toHaveBeenCalledWith(DAYDREAM_STARTERS[0]);
	});

	it('toggles an idea into the box, and asks only once there is something to ask', async () => {
		const { container, ondescribe } = await renderStarter();
		const write = button(container, 'Write it');
		expect(waProp(write, 'disabled')).toBe(true);
		expect([...container.querySelectorAll('.chip')].map((shown) => shown.textContent)).toEqual(
			ideas
		);
		const [chip] = ideas;
		button(container, chip ?? '')?.click();
		const box = container.querySelector('textarea');
		await waitFor(() => expect(box?.value).toBe(chip));
		await waSettled(container);
		expect(waProp(write, 'disabled')).toBe(false);
		write?.click();
		expect(ondescribe).toHaveBeenCalled();
	});

	it('shuffles to a few other ideas', async () => {
		const { container } = await renderStarter();
		const shown = () => [...container.querySelectorAll('.chip')].map((chip) => chip.textContent);
		container.querySelector<HTMLElement>('wa-button.shuffle')?.click();
		await waitFor(() => expect(shown()).not.toEqual(ideas));
		expect(shown()).toHaveLength(ideas.length);
		expect(shown().filter((idea) => ideas.includes(idea ?? ''))).toEqual([]);
	});

	it('narrows the stories to the side you are on, and back to either', async () => {
		const { container } = await renderStarter();
		const cards = () => container.querySelectorAll('.card');
		const pick = (label: string) =>
			[...container.querySelectorAll<HTMLLabelElement>('.side')]
				.find((candidate) => candidate.textContent?.trim() === label)
				?.click();

		pick('Dom');
		await waitFor(() => expect(cards()).toHaveLength(startersFor('dom').length));
		expect(container.textContent).not.toContain('You’re the sub');
		expect(container.textContent).toContain('You’re the dom');

		pick('Sub');
		await waitFor(() => expect(cards()).toHaveLength(startersFor('sub').length));
		expect(container.textContent).not.toContain('You’re the dom');

		pick('Either');
		await waitFor(() => expect(cards()).toHaveLength(DAYDREAM_STARTERS.length));
	});

	it('says why a description came back with nothing', async () => {
		const { container } = await renderStarter({ idea: 'x', problem: 'No ideas came back.' });
		expect(container.querySelector('[role="alert"]')?.textContent).toBe('No ideas came back.');
	});

	it('without suggestions, offers the ready-made stories and building one, and nothing to describe', async () => {
		const { container, onblank } = await renderStarter({ suggestionsOn: false });
		expect(container.querySelector('textarea')).toBeNull();
		expect(container.textContent).toContain('Pick one');
		expect(container.querySelectorAll('.card')).toHaveLength(DAYDREAM_STARTERS.length);
		button(container, 'Build it yourself')?.click();
		expect(onblank).toHaveBeenCalled();
	});
});
