import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import {
	DAYDREAM_IDEA_CHIPS,
	DAYDREAM_STARTERS,
	type StarterSide,
	startersFor
} from '$lib/daydream/starters';
import type { GeneratedIdea } from '$lib/daydream/suggestions';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import DaydreamStarter from './DaydreamStarter.svelte';

/** Three of them, as if drawn by the page's load. */
const ideas = DAYDREAM_IDEA_CHIPS.slice(2, 5);

const generatedIdeas: GeneratedIdea[] = [
	{
		title: 'Caught',
		premise: 'Your neighbour saw everything.',
		tags: ['exhibition'],
		you: 'sub',
		dials: { heat: 4, kink: 3 }
	},
	{
		title: 'Your rules',
		premise: 'They signed up to obey.',
		tags: ['protocol'],
		you: 'dom',
		dials: { heat: 4, kink: 4 }
	}
];

async function renderStarter(
	props: {
		suggestionsOn?: boolean;
		idea?: string;
		problem?: string;
		side?: StarterSide | null;
		generated?: { request: string; ideas: GeneratedIdea[] } | null;
		ongenerate?: (request: string) => Promise<string | null>;
	} = {}
) {
	const handlers = {
		ondescribe: vi.fn(),
		onstarter: vi.fn(),
		onblank: vi.fn(),
		onidea: vi.fn(),
		ongenerate: vi.fn(props.ongenerate ?? (async () => null))
	};
	const rendered = render(DaydreamStarter, {
		idea: props.idea ?? '',
		ideas,
		side: props.side ?? null,
		suggestionsOn: props.suggestionsOn ?? true,
		asking: false,
		problem: props.problem ?? null,
		generated: props.generated ?? null,
		writing: null,
		ideaProblem: null,
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

	it('generates ideas from what is asked for in a dialog, for the side chosen', async () => {
		const { container, ongenerate } = await renderStarter({
			side: 'sub',
			ongenerate: async () => 'No ideas came back that time. Try again.'
		});
		button(container, 'Generate')?.click();
		const dialog = await waitFor(() => {
			const found = document.querySelector<HTMLElement>('wa-dialog');
			expect(found).not.toBeNull();
			return found as HTMLElement;
		});
		await waSettled(dialog);
		expect(dialog.textContent).toContain('as the sub');
		const generate = button(dialog, 'Generate');
		expect(waProp(generate, 'disabled')).toBe(true);

		const box = dialog.querySelector<HTMLElement & { value: string }>('wa-textarea');
		if (box) {
			box.value = 'teasing in public';
			box.dispatchEvent(new Event('input'));
		}
		await waitFor(() => expect(waProp(generate, 'disabled')).toBe(false));
		generate?.click();
		await waitFor(() => expect(ongenerate).toHaveBeenCalledWith('teasing in public'));
		// A failure is said in the dialog, which stays open to try again.
		await waitFor(() =>
			expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('No ideas came back')
		);
	});

	it('shows the generated ideas for the side chosen, and picks one', async () => {
		const { container, onidea } = await renderStarter({
			side: 'sub',
			generated: { request: 'something filthy', ideas: generatedIdeas }
		});
		const group = container.querySelector('.generated');
		expect(group?.textContent).toContain('For “something filthy”');
		const cards = [...(group?.querySelectorAll<HTMLElement>('.card') ?? [])];
		expect(cards.map((card) => card.querySelector('.title')?.textContent)).toEqual(['Caught']);
		expect(cards[0]?.textContent).toContain('You’re the sub');
		expect(cards[0]?.querySelector('.tag')?.textContent).toBe('exhibition');
		cards[0]?.click();
		expect(onidea).toHaveBeenCalledWith(generatedIdeas[0]);
		// The ready-made ones are still all there beneath them.
		expect(container.querySelectorAll('.card')).toHaveLength(startersFor('sub').length + 1);
	});

	it('says so when none of the generated ideas are for the side now chosen', async () => {
		const { container } = await renderStarter({
			side: 'dom',
			generated: { request: 'something filthy', ideas: [generatedIdeas[0] as GeneratedIdea] }
		});
		expect(container.querySelector('.generated')?.textContent).toContain(
			'None of these have you as the dom'
		);
	});

	it('without suggestions, offers the ready-made stories and building one, and nothing to describe', async () => {
		const { container, onblank } = await renderStarter({ suggestionsOn: false });
		expect(container.querySelector('textarea')).toBeNull();
		expect(button(container, 'Generate')).toBeUndefined();
		expect(container.textContent).toContain('Pick one');
		expect(container.querySelectorAll('.card')).toHaveLength(DAYDREAM_STARTERS.length);
		button(container, 'Build it yourself')?.click();
		expect(onblank).toHaveBeenCalled();
	});
});
