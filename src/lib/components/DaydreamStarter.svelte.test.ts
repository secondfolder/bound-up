import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { ExchangeLogView } from '$lib/daydream/exchange-log';
import { ModelWatch } from '$lib/daydream/model-watch.svelte';
import {
	DAYDREAM_STARTERS,
	matchesSearch,
	SHOWN_STARTERS,
	type StarterSide,
	starterIdea,
	startersFor
} from '$lib/daydream/starters';
import type { SuggestFailure } from '$lib/daydream/suggest';
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
		sideFromBrief: false,
		voice: null,
		dials: { heat: 4, kink: 3 },
		research: ''
	},
	{
		title: 'Your rules',
		premise: 'They signed up to obey.',
		tags: ['protocol'],
		you: 'dom',
		sideFromBrief: false,
		voice: null,
		dials: { heat: 4, kink: 4 },
		research: ''
	}
];

async function renderStarter(
	props: {
		suggestionsOn?: boolean;
		brief?: string;
		problem?: SuggestFailure;
		side?: StarterSide | null;
		generated?: { brief: string; ideas: GeneratedIdea[]; log?: ExchangeLogView } | null;
		debug?: boolean;
		ongenerate?: (brief: string) => Promise<SuggestFailure | null>;
		onmore?: () => Promise<SuggestFailure | null>;
		starterOrder?: readonly string[];
		watching?: ModelWatch | null;
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
		brief: props.brief ?? '',
		side: props.side ?? null,
		suggestionsOn: props.suggestionsOn ?? true,
		// The catalog's own order unless a test says otherwise, so a test can name the first.
		starterOrder: props.starterOrder ?? DAYDREAM_STARTERS.map((starter) => starter.id),
		asking: false,
		problem: props.problem ?? null,
		generated: props.generated ?? null,
		writing: null,
		ideaProblem: null,
		debug: props.debug ?? false,
		watching: props.watching ?? null,
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
	it('starts each card’s facts on one line across a row, however long its premise', async () => {
		const { container } = await renderStarter();
		const cards = [...container.querySelectorAll<HTMLElement>('.card')];
		const top = (card: HTMLElement) => Math.round(card.getBoundingClientRect().top);
		const firstRow = cards.filter((card) => top(card) === top(cards[0] as HTMLElement));
		expect(firstRow.length).toBeGreaterThan(1);
		const metaTops = firstRow.map((card) =>
			Math.round(defined(card.querySelector('.meta'), 'facts').getBoundingClientRect().top)
		);
		expect(new Set(metaTops).size).toBe(1);
	});

	it('shows how generated ideas were written, in debug mode only', async () => {
		const generated = {
			brief: 'from https://www.reddit.com/r/Example/',
			ideas: generatedIdeas,
			log: {
				model: 'test/model',
				api: 'responses',
				cost: null,
				entries: [{ who: 'model' as const, label: 'Reply', text: '{"ideas":[]}' }]
			}
		};
		const debugging = await renderStarter({ generated, debug: true });
		expect(waProp(debugging.container.querySelector('.generated wa-details'), 'summary')).toBe(
			'Chat log: test/model, responses'
		);
		debugging.unmount();

		const plain = await renderStarter({ generated });
		expect(plain.container.querySelector('.generated wa-details')).toBeNull();
	});

	it('offers a few ready-made daydreams, with their level and how they are told', async () => {
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

	it('shows every ready-made daydream from "More ideas", and the button goes', async () => {
		const { container } = await renderStarter();
		const cards = () => container.querySelectorAll('.ready-made > .cards .card');
		expect(cards()).toHaveLength(SHOWN_STARTERS);
		const more = defined(button(container, 'More ideas'), 'the More ideas button');
		more.click();
		await waitFor(() => expect(cards()).toHaveLength(DAYDREAM_STARTERS.length));
		expect(button(container, 'More ideas')).toBeUndefined();
	});

	it('writes the daydream described, or suggests similar ones, once there is something to ask', async () => {
		const { container, ondescribe, ongenerate } = await renderStarter();
		const section = container.querySelector('.describe') as HTMLElement;
		const write = button(section, 'Write this daydream');
		const suggest = button(section, 'Suggest daydreams for this');
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

	it('lays how a suggestion is going over the box it was asked from, and the live chat under it', async () => {
		let answer: (problem: SuggestFailure | null) => void = () => undefined;
		const watching = new ModelWatch(true);
		watching.watch.onLive?.({
			kind: 'request',
			body: JSON.stringify({ model: 'test/model', messages: [{ role: 'user', content: 'Hi' }] })
		});
		const { container } = await renderStarter({
			brief: 'teasing in public',
			watching,
			ongenerate: () =>
				new Promise((resolve) => {
					answer = resolve;
				})
		});
		const section = container.querySelector('.describe') as HTMLElement;
		expect(section.querySelector('.over-box')).toBeNull();
		button(section, 'Suggest daydreams for this')?.click();
		await waitFor(() => expect(section.querySelector('.box .over-box')).not.toBeNull());
		const over = section.querySelector('.over-box') as HTMLElement;
		expect(over.textContent).toContain('Waiting for the model');
		// The live chat has no room over the box, so it is not drawn there.
		expect(over.querySelector('wa-details')).toBeNull();
		expect(section.querySelector(':scope > .model-progress wa-details.live')).not.toBeNull();
		// The progress is not part of what the box is called.
		expect(section.querySelector('textarea')?.labels?.[0]?.textContent).not.toContain('Waiting');
		answer(null);
		await waitFor(() => expect(section.querySelector('.over-box')).toBeNull());
	});

	it('says why no similar daydreams came, beside the box', async () => {
		let answer: (problem: SuggestFailure | null) => void = () => undefined;
		const { container } = await renderStarter({
			brief: 'teasing in public',
			ongenerate: () =>
				new Promise((resolve) => {
					answer = resolve;
				})
		});
		const section = container.querySelector('.describe') as HTMLElement;
		const write = button(section, 'Write this daydream');
		button(section, 'Suggest daydreams for this')?.click();
		// Nothing else can be asked while they are thought up.
		await waitFor(() => expect(section.textContent).toContain('Thinking up daydreams…'));
		expect(waProp(write, 'disabled')).toBe(true);
		answer({ error: 'No ideas came back that time. Try again.' });
		await waitFor(() =>
			expect(section.querySelector('[role="alert"]')?.textContent).toContain('No ideas came back')
		);
		expect(waProp(write, 'disabled')).toBe(false);
	});

	it('asks "You as" in a row with the box\'s buttons, not beside the ready-made daydreams', async () => {
		const { container } = await renderStarter({ side: 'sub' });
		const row = container.querySelector('.describe .controls');
		expect(row?.firstElementChild?.matches('.sides')).toBe(true);
		expect(row?.lastElementChild?.matches('.actions')).toBe(true);
		expect(container.querySelector('.ready-made .sides')).toBeNull();
		expect(container.querySelectorAll('.sides')).toHaveLength(1);
	});

	it('narrows the stories to the side you are on, and back to either', async () => {
		// One of each side first, so the first few shown have both whatever
		// order the catalog is in: its first ones are all no one's.
		const { container } = await renderStarter({ starterOrder: ['your-office', 'after-hours'] });
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

	it('shows the ready-made daydreams in the order the page drew', async () => {
		const reversed = DAYDREAM_STARTERS.map((starter) => starter.id).reverse();
		const { container } = await renderStarter({ starterOrder: reversed });
		const titles = [...container.querySelectorAll('.ready-made .card .title')].map(
			(title) => title.textContent
		);
		expect(titles).toEqual(
			[...DAYDREAM_STARTERS]
				.reverse()
				.slice(0, SHOWN_STARTERS)
				.map((starter) => starterIdea(starter).idea.title)
		);
	});

	it('says why a description came back with nothing', async () => {
		const { container } = await renderStarter({
			brief: 'x',
			problem: { error: 'No ideas came back.' }
		});
		expect(container.querySelector('[role="alert"]')?.textContent).toBe('No ideas came back.');
	});

	it('shows the generated ideas for the side chosen, and picks one', async () => {
		const { container, onidea } = await renderStarter({
			side: 'sub',
			generated: { brief: 'something filthy', ideas: generatedIdeas }
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

	it('says how a generated idea is told, when it came with a voice', async () => {
		const { container } = await renderStarter({
			generated: {
				brief: 'mantras',
				ideas: [{ ...(generatedIdeas[0] as GeneratedIdea), voice: 'monologue' }]
			}
		});
		const card = container.querySelector('.generated .card');
		expect(card?.querySelector('.meta')?.textContent).toContain('A monologue');
	});

	it('clears the generated ideas', async () => {
		const { container, onclear } = await renderStarter({
			generated: { brief: 'something filthy', ideas: generatedIdeas }
		});
		button(container.querySelector('.generated') as HTMLElement, 'Clear')?.click();
		expect(onclear).toHaveBeenCalled();
	});

	it('asks for more ideas from the end of the list, and says why none came', async () => {
		let answer: (problem: SuggestFailure | null) => void = () => undefined;
		const { container, onmore, onidea } = await renderStarter({
			generated: { brief: 'something filthy', ideas: generatedIdeas },
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

		answer({ error: 'No new ideas came back that time. Try again.' });
		await waitFor(() =>
			expect(group.querySelector('[role="alert"]')?.textContent).toContain('No new ideas')
		);
	});

	it('says so when none of the generated ideas are for the side now chosen', async () => {
		const { container } = await renderStarter({
			side: 'dom',
			generated: { brief: 'something filthy', ideas: [generatedIdeas[0] as GeneratedIdea] }
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

	it('searches the daydreams by title, premise and tags', async () => {
		const { container } = await renderStarter();
		const cards = () => container.querySelectorAll('.ready-made .card');

		// A tag no title or premise says, so only the tags can find it.
		const tagsOnly = (each: (typeof DAYDREAM_STARTERS)[number]) => {
			const { title, premise } = starterIdea(each).idea;
			const said = `${title} ${premise}`.toLocaleLowerCase();
			return each.tags.filter((candidate) => !said.includes(candidate.toLocaleLowerCase()));
		};
		const starter = defined(
			DAYDREAM_STARTERS.find((each) => tagsOnly(each).length > 0),
			'a story with a tag only its tags say'
		);
		const tag = defined(tagsOnly(starter)[0], 'that tag');
		const byTag = DAYDREAM_STARTERS.filter((each) =>
			matchesSearch({ ...starterIdea(each).idea, tags: each.tags }, tag.toUpperCase())
		);
		await search(container, tag.toUpperCase());
		await waitFor(() => expect(cards()).toHaveLength(byTag.length));
		expect(byTag).toContain(starter);

		await search(container, 'nothing could possibly match this');
		await waitFor(() => expect(cards()).toHaveLength(0));
		expect(container.querySelector('.ready-made')?.textContent).toContain('No daydreams match');

		// Emptied, it is back to the first few.
		await search(container, '');
		await waitFor(() => expect(cards()).toHaveLength(SHOWN_STARTERS));
	});

	it('searches every ready-made daydream, not just the few shown', async () => {
		const { container } = await renderStarter();
		const last = defined(DAYDREAM_STARTERS.at(-1), 'the last story');
		const { title } = starterIdea(last).idea;
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
			generated: { brief: 'something filthy', ideas: generatedIdeas }
		});
		await search(container, 'protocol');
		const titles = () =>
			[...container.querySelectorAll('.generated .card .title')].map((title) => title.textContent);
		await waitFor(() => expect(titles()).toEqual(['Your rules']));
	});

	it('without suggestions, offers the ready-made daydreams and building one, and nothing to describe', async () => {
		const { container, onblank } = await renderStarter({ suggestionsOn: false });
		expect(container.querySelector('textarea')).toBeNull();
		expect(button(container, 'Write this daydream')).toBeUndefined();
		expect(button(container, 'Suggest daydreams for this')).toBeUndefined();
		// "You as" still filters them, beside the heading.
		expect(container.querySelector('.ready-made .sides')).not.toBeNull();
		expect(container.textContent).toContain('Daydream suggestions');
		expect(container.querySelectorAll('.card')).toHaveLength(SHOWN_STARTERS);
		button(container, 'Build it yourself')?.click();
		expect(onblank).toHaveBeenCalled();
	});
});
