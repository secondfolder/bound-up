import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { DAYDREAM_IDEA_CHIPS, DAYDREAM_STARTERS } from '$lib/daydream/starters';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import DaydreamStarter from './DaydreamStarter.svelte';

async function renderStarter(
	props: { suggestionsOn?: boolean; idea?: string; problem?: string } = {}
) {
	const handlers = { ondescribe: vi.fn(), onstarter: vi.fn(), onblank: vi.fn() };
	const rendered = render(DaydreamStarter, {
		idea: props.idea ?? '',
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
		expect(cards[0]?.textContent).toContain('The lighthouse');
		expect(cards[0]?.textContent).toContain('SFW');
		expect(cards[0]?.textContent).toContain('Talk with a character');
		cards[0]?.click();
		expect(onstarter).toHaveBeenCalledWith(DAYDREAM_STARTERS[0]);
	});

	it('toggles an idea into the box, and asks only once there is something to ask', async () => {
		const { container, ondescribe } = await renderStarter();
		const write = button(container, 'Write it');
		expect(waProp(write, 'disabled')).toBe(true);
		const [chip] = DAYDREAM_IDEA_CHIPS;
		button(container, chip ?? '')?.click();
		const box = container.querySelector('textarea');
		await waitFor(() => expect(box?.value).toBe(chip));
		await waSettled(container);
		expect(waProp(write, 'disabled')).toBe(false);
		write?.click();
		expect(ondescribe).toHaveBeenCalled();
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
