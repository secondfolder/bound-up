import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import {
	DAYDREAM_STARTERS,
	matchesSearch,
	SHOWN_STARTERS,
	type StarterSide,
	starterScene,
	startersFor
} from '$lib/daydream/starters';
import type { GeneratedIdea } from '$lib/daydream/suggestions';
import { defined } from '$lib/testing/defined';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import DaydreamStarter from './DaydreamStarter.svelte';

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
		onmore?: () => Promise<string | null>;
		starterOrder?: readonly string[];
	} = {}
) {
	const handlers = {
		ondescribe: vi.fn(),
		onstarter: vi.fn(),
		onblank: vi.fn(),
		onidea: vi.fn(),
		ongenerate: vi.fn(props.ongenerate ?? (async () => null)),
		onmore: vi.fn(props.onmore ?? (async () => null)),
		onclear: vi.fn()
	};
	const rendered = render(DaydreamStarter, {
		idea: props.idea ?? '',
		side: props.side ?? null,
		suggestionsOn: props.suggestionsOn ?? true,
		// The catalog's own order unless a test says otherwise, so a test can name the first.
		starterOrder: props.starterOrder ?? DAYDREAM_STARTERS.map((starter) => starter.id),
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
	it('offers a few ready-made stories, with their level and how they are told', async () => {
		const { container, onstarter } = await renderStarter();
		const cards = [...container.querySelectorAll<HTMLElement>('.card')];
		expect(cards).toHaveLength(SHOWN_STARTERS);
		expect(cards[0]?.textContent).toContain('Only one bed');
		expect(cards[0]?.textContent).toContain('SFW');
		expect(cards[0]?.textContent).toContain('Talk with a character');
		const tags = [...(cards[0]?.querySelectorAll('.tag') ?? [])].map((tag) => tag.textContent);
		expect(tags).toEqual(DAYDREAM_STARTERS[0]?.tags);
		cards[0]?.click();
		expect(onstarter).toHaveBeenCalledWith(DAYDREAM_STARTERS[0]);
	});

	it('shows every ready-made story from "More ideas", and the button goes', async () => {
		const { container } = await renderStarter();
		const cards = () => container.querySelectorAll('.ready-made > .cards .card');
		expect(cards()).toHaveLength(SHOWN_STARTERS);
		const more = defined(button(container, 'More ideas'), 'the More ideas button');
		more.click();
		await waitFor(() => expect(cards()).toHaveLength(DAYDREAM_STARTERS.length));
		expect(button(container, 'More ideas')).toBeUndefined();
	});

	it('writes the story described, or suggests similar ones, once there is something to ask', async () => {
		const { container, ondescribe, ongenerate } = await renderStarter();
		const section = container.querySelector('.describe') as HTMLElement;
		const write = button(section, 'Write this story');
		const suggest = button(section, 'Suggest stories for this');
		expect(waProp(write, 'disabled')).toBe(true);
		expect(waProp(suggest, 'disabled')).toBe(true);

		const box = section.querySelector('textarea') as HTMLTextAreaElement;
		box.value = '  teasing in public ';
		box.dispatchEvent(new Event('input', { bubbles: true }));
		await waitFor(() => expect(waProp(write, 'disabled')).toBe(false));
		expect(waProp(suggest, 'disabled')).toBe(false);
		write?.click();
		expect(ondescribe).toHaveBeenCalled();
		suggest?.click();
		await waitFor(() => expect(ongenerate).toHaveBeenCalledWith('teasing in public'));
	});

	it('says why no similar stories came, beside the box', async () => {
		let answer: (problem: string | null) => void = () => undefined;
		const { container } = await renderStarter({
			idea: 'teasing in public',
			ongenerate: () =>
				new Promise((resolve) => {
					answer = resolve;
				})
		});
		const section = container.querySelector('.describe') as HTMLElement;
		const write = button(section, 'Write this story');
		button(section, 'Suggest stories for this')?.click();
		// Nothing else can be asked while they are thought up.
		await waitFor(() => expect(section.textContent).toContain('Thinking up stories…'));
		expect(waProp(write, 'disabled')).toBe(true);
		answer('No ideas came back that time. Try again.');
		await waitFor(() =>
			expect(section.querySelector('[role="alert"]')?.textContent).toContain('No ideas came back')
		);
		expect(waProp(write, 'disabled')).toBe(false);
	});

	it('asks "You as" in a row with the box\'s buttons, not beside the ready-made stories', async () => {
		const { container } = await renderStarter({ side: 'sub' });
		const row = container.querySelector('.describe .controls');
		expect(row?.firstElementChild?.matches('.sides')).toBe(true);
		expect(row?.lastElementChild?.matches('.actions')).toBe(true);
		expect(container.querySelector('.ready-made .sides')).toBeNull();
		expect(container.querySelectorAll('.sides')).toHaveLength(1);
	});

	it('narrows the stories to the side you are on, and back to either', async () => {
		const { container } = await renderStarter();
		const cards = () => container.querySelectorAll('.card');
		const pick = (label: string) =>
			[...container.querySelectorAll<HTMLLabelElement>('.side')]
				.find((candidate) => candidate.textContent?.trim() === label)
				?.click();

		// Under "Either" each card says which side you are on in it.
		expect(container.textContent).toContain('You’re the dom');
		expect(container.textContent).toContain('You’re the sub');

		// With a side chosen every card is for it, so none says so.
		pick('Dom');
		await waitFor(() => expect(cards()).toHaveLength(SHOWN_STARTERS));
		expect(startersFor('dom').length).toBeGreaterThan(SHOWN_STARTERS);
		expect(container.textContent).not.toContain('You’re the');

		pick('Sub');
		await waitFor(() => expect(cards()).toHaveLength(SHOWN_STARTERS));
		expect(startersFor('sub').length).toBeGreaterThan(SHOWN_STARTERS);
		expect(container.textContent).not.toContain('You’re the');

		pick('Either');
		await waitFor(() => expect(cards()).toHaveLength(SHOWN_STARTERS));
		expect(container.textContent).toContain('You’re the sub');
	});

	it('shows the ready-made stories in the order the page drew', async () => {
		const reversed = DAYDREAM_STARTERS.map((starter) => starter.id).reverse();
		const { container } = await renderStarter({ starterOrder: reversed });
		const titles = [...container.querySelectorAll('.ready-made .card .title')].map(
			(title) => title.textContent
		);
		expect(titles).toEqual(
			[...DAYDREAM_STARTERS]
				.reverse()
				.slice(0, SHOWN_STARTERS)
				.map((starter) => starterScene(starter).scene.title)
		);
	});

	it('says why a description came back with nothing', async () => {
		const { container } = await renderStarter({ idea: 'x', problem: 'No ideas came back.' });
		expect(container.querySelector('[role="alert"]')?.textContent).toBe('No ideas came back.');
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
		expect(cards[0]?.textContent).not.toContain('You’re the');
		expect(cards[0]?.querySelector('.tag')?.textContent).toBe('exhibition');
		cards[0]?.click();
		expect(onidea).toHaveBeenCalledWith(generatedIdeas[0]);
		// Only the generated ones: the ready-made ones are put away until cleared.
		expect(container.querySelectorAll('.card')).toHaveLength(1);
	});

	it('clears the generated ideas', async () => {
		const { container, onclear } = await renderStarter({
			generated: { request: 'something filthy', ideas: generatedIdeas }
		});
		button(container.querySelector('.generated') as HTMLElement, 'Clear')?.click();
		expect(onclear).toHaveBeenCalled();
	});

	it('asks for more ideas from the end of the list, and says why none came', async () => {
		let answer: (problem: string | null) => void = () => undefined;
		const { container, onmore, onidea } = await renderStarter({
			generated: { request: 'something filthy', ideas: generatedIdeas },
			onmore: () =>
				new Promise((resolve) => {
					answer = resolve;
				})
		});
		const group = container.querySelector('.generated') as HTMLElement;
		const more = button(group, 'More ideas');
		expect(group.lastElementChild).toBe(more);
		more?.click();
		expect(onmore).toHaveBeenCalled();
		// While they come, the button waits but the ideas already there can be picked.
		await waitFor(() => expect(waProp(more, 'disabled')).toBe(true));
		const card = group.querySelector<HTMLButtonElement>('.card');
		expect(card?.disabled).toBe(false);
		card?.click();
		expect(onidea).toHaveBeenCalledWith(generatedIdeas[0]);

		answer('No new ideas came back that time. Try again.');
		await waitFor(() =>
			expect(group.querySelector('[role="alert"]')?.textContent).toContain('No new ideas')
		);
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

	/** Types into the search beside "Story suggestions". */
	async function search(container: HTMLElement, text: string) {
		const field = defined(
			container.querySelector<HTMLElement & { value: string }>('.ready-made .search wa-input'),
			'the search field'
		);
		field.value = text;
		field.dispatchEvent(new Event('input'));
		await waSettled(container);
	}

	it('searches the stories by title, premise and tags', async () => {
		const { container } = await renderStarter();
		const cards = () => container.querySelectorAll('.ready-made .card');

		// A tag no title or premise says, so only the tags can find it.
		const tagsOnly = (each: (typeof DAYDREAM_STARTERS)[number]) => {
			const { title, premise } = starterScene(each).scene;
			const said = `${title} ${premise}`.toLocaleLowerCase();
			return each.tags.filter((candidate) => !said.includes(candidate.toLocaleLowerCase()));
		};
		const starter = defined(
			DAYDREAM_STARTERS.find((each) => tagsOnly(each).length > 0),
			'a story with a tag only its tags say'
		);
		const tag = defined(tagsOnly(starter)[0], 'that tag');
		const byTag = DAYDREAM_STARTERS.filter((each) =>
			matchesSearch({ ...starterScene(each).scene, tags: each.tags }, tag.toUpperCase())
		);
		await search(container, tag.toUpperCase());
		await waitFor(() => expect(cards()).toHaveLength(byTag.length));
		expect(byTag).toContain(starter);

		await search(container, 'nothing could possibly match this');
		await waitFor(() => expect(cards()).toHaveLength(0));
		expect(container.querySelector('.ready-made')?.textContent).toContain('No stories match');

		// Emptied, it is back to the first few.
		await search(container, '');
		await waitFor(() => expect(cards()).toHaveLength(SHOWN_STARTERS));
	});

	it('searches every ready-made story, not just the few shown', async () => {
		const { container } = await renderStarter();
		const last = defined(DAYDREAM_STARTERS.at(-1), 'the last story');
		const { title } = starterScene(last).scene;
		await search(container, title);
		const titles = () =>
			[...container.querySelectorAll('.ready-made > .cards .card .title')].map(
				(shown) => shown.textContent
			);
		await waitFor(() => expect(titles()).toContain(title));
		expect(button(container, 'More ideas')).toBeUndefined();
	});

	it('searches the suggested stories too', async () => {
		const { container } = await renderStarter({
			generated: { request: 'something filthy', ideas: generatedIdeas }
		});
		await search(container, 'protocol');
		const titles = () =>
			[...container.querySelectorAll('.generated .card .title')].map((title) => title.textContent);
		await waitFor(() => expect(titles()).toEqual(['Your rules']));
	});

	it('without suggestions, offers the ready-made stories and building one, and nothing to describe', async () => {
		const { container, onblank } = await renderStarter({ suggestionsOn: false });
		expect(container.querySelector('textarea')).toBeNull();
		expect(button(container, 'Write this story')).toBeUndefined();
		expect(button(container, 'Suggest stories for this')).toBeUndefined();
		// "You as" still filters them, beside the heading.
		expect(container.querySelector('.ready-made .sides')).not.toBeNull();
		expect(container.textContent).toContain('Story suggestions');
		expect(container.querySelectorAll('.card')).toHaveLength(SHOWN_STARTERS);
		button(container, 'Build it yourself')?.click();
		expect(onblank).toHaveBeenCalled();
	});
});
