import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { HypnoFile } from '$lib/playroom/iq-test/hypno';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';

const tryFetch = vi.fn();
vi.mock('$lib/request-failure.svelte', () => ({ tryFetch }));

const { HypnoSession } = await import('$lib/playroom/iq-test/hypno-session.svelte');
const { default: HypnoBrowser } = await import('./HypnoBrowser.svelte');

const FILE: HypnoFile = {
	source: 'bambicloud',
	pageUrl: 'https://bambicloud.com/file/00000000-0000-4000-8000-000000000001',
	uuid: '00000000-0000-4000-8000-000000000001',
	name: 'Bimbo Drone',
	author: 'bimbodollbambi',
	durationMs: 5 * 60_000,
	fileType: 'loop',
	triggers: ['Good girl'],
	description: '',
	warnings: ['Contains obedience suggestions'],
	mediaUrl: 'https://cdn.bambicloud.com/x.mp3',
	plays: 1
};

/** A fresh response per search: a body can only be read once. */
function answer() {
	tryFetch.mockImplementation(async () =>
		Response.json({
			files: [FILE],
			total: 1,
			triggers: [{ name: 'Good girl', count: 3 }],
			categories: [{ id: 'loop', count: 55 }]
		})
	);
}

/** Every search the drawer has made so far, as its query parameters. */
const searches = () =>
	tryFetch.mock.calls.map(([url]) => new URL(String(url), 'http://x').searchParams);

afterEach(() => tryFetch.mockReset());

async function renderDrawer(categories = ['loop', 'subliminal'] as const) {
	answer();
	const session = new HypnoSession([...categories]);
	const oncategories = vi.fn();
	const view = render(HypnoBrowser, { session, oncategories });
	await waSettled(view.container);
	await vi.waitFor(() => {
		if (tryFetch.mock.calls.length === 0) {
			throw new Error('the drawer has not searched yet');
		}
	});
	return { ...view, session, oncategories };
}

describe('HypnoBrowser', () => {
	it('searches within the session’s categories when shown, and lists what it finds', async () => {
		const { container } = await renderDrawer();
		expect(searches()[0]?.get('categories')).toBe('loop,subliminal');
		await expect
			.poll(() => container.querySelector('[data-testid="hypno-results"]')?.textContent ?? '')
			.toContain('Bimbo Drone');
		expect(container).toHaveTextContent('Contains obedience suggestions');
		const title = container.querySelector('[data-testid="hypno-results"] a.name');
		expect(title).toHaveTextContent('Bimbo Drone');
		expect(title).toHaveAttribute('href', FILE.pageUrl);
		expect(title).toHaveAttribute('target', '_blank');
	});

	it('starts with the given categories ticked, and remembers a change', async () => {
		const { container, session, oncategories } = await renderDrawer();
		const box = (label: string) =>
			defined(
				[...container.querySelectorAll<HTMLLabelElement>('label.chip')].find((chip) =>
					chip.textContent?.includes(label)
				),
				label
			).querySelector('input') as HTMLInputElement;
		expect(box('Loops').checked).toBe(true);
		expect(box('Music').checked).toBe(false);

		box('Music').click();
		await tick();
		expect(session.filter.categories).toEqual(['loop', 'subliminal', 'music']);
		expect(oncategories).toHaveBeenCalledWith(['loop', 'subliminal', 'music']);
		await expect.poll(() => searches().at(-1)?.get('categories')).toBe('loop,subliminal,music');
	});

	it('narrows by trigger, and plays the one chosen', async () => {
		const { container, session } = await renderDrawer();
		await expect
			.poll(() => container.querySelector('label.chip input[name="hypno-trigger"]'))
			.not.toBeNull();
		(container.querySelector('label.chip input[name="hypno-trigger"]') as HTMLInputElement).click();
		await tick();
		expect(session.filter.trigger).toBe('Good girl');
		await expect.poll(() => searches().at(-1)?.get('trigger')).toBe('Good girl');

		const play = vi.spyOn(session, 'play');
		await waSettled(container);
		const playButton = defined(
			[...container.querySelectorAll<HTMLElement>('[data-testid="hypno-results"] wa-button')][0],
			'the Play button'
		);
		playButton.click();
		expect(play).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bimbo Drone' }));
	});

	it('says so when hypnos could not be loaded', async () => {
		tryFetch.mockResolvedValue(null);
		const session = new HypnoSession(['loop']);
		const { container } = render(HypnoBrowser, { session, oncategories: vi.fn() });
		await expect.poll(() => container.textContent ?? '').toContain("Couldn't load hypnos");
	});

	it('marks the one playing instead of offering it, and stays open once one is chosen', async () => {
		const { container, session } = await renderDrawer();
		const list = await vi.waitFor(() =>
			defined(container.querySelector('[data-testid="hypno-results"] li'), 'a result')
		);
		expect(container.querySelector('[data-testid="hypno-playing"]')).toBeNull();
		const play = defined(
			[...list.querySelectorAll<HTMLElement>('wa-button')].find((button) =>
				button.textContent?.includes('Play')
			),
			'the Play button'
		);
		play.click();
		await tick();
		expect(session.current?.uuid).toBe(FILE.uuid);
		expect(container.querySelector('[data-testid="hypno-playing"]')).toHaveTextContent('Playing');
		expect(container.querySelector('[data-testid="hypno-results"] wa-button')).toBeNull();
		expect(container.querySelector('.hypno-browser')).not.toBeNull();
	});
});
