import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { layoutFor, MINIMAL_LAYOUT } from '$lib/playroom/iq-test/dock';
import { defined } from '$lib/testing/defined';
import EmptyPanelHarness from '$lib/testing/EmptyPanelHarness.svelte';
import { waSettled } from '$lib/testing/web-awesome';
import MediaTab from './MediaTab.svelte';

const WIDEST = layoutFor(2000);

function renderTab(props: Partial<Parameters<typeof render<typeof MediaTab>>[1]> = {}) {
	const ontoggle = vi.fn();
	const view = render(MediaTab, {
		name: 'Hypno',
		icon: 'headphones',
		title: 'Bimbo Drone',
		detail: '4:12 left',
		channel: 'hypno',
		layout: WIDEST,
		expanded: false,
		panelId: 'hypno-panel',
		ontoggle,
		...props
	});
	const more = defined(
		view.container.querySelector<HTMLButtonElement>('button.more'),
		'the more button'
	);
	return { ...view, ontoggle, more };
}

describe('MediaTab', () => {
	it('is a named region with its title, detail and volume', () => {
		const { container } = renderTab();
		const region = defined(container.querySelector('section'), 'the tab');
		expect(region).toHaveAttribute('aria-label', 'Hypno');
		expect(region).toHaveTextContent('Bimbo Drone');
		expect(region).toHaveTextContent('4:12 left');
		expect(container.querySelector('.sound-control')).not.toBeNull();
	});

	it('names and wires the button that slides up its panel', () => {
		const { more, ontoggle } = renderTab();
		expect(more).toHaveAccessibleName('More hypno controls');
		expect(more).toHaveAttribute('aria-controls', 'hypno-panel');
		expect(more).toHaveAttribute('aria-expanded', 'false');
		more.click();
		expect(ontoggle).toHaveBeenCalledTimes(1);
	});

	it('opens from a click anywhere on the bar that is not a control of its own', async () => {
		const onclick = vi.fn();
		const { container, ontoggle } = renderTab({
			action: { label: 'Next', icon: 'forward-step', onclick }
		});
		await waSettled(container);
		defined(container.querySelector<HTMLElement>('.bar .title'), 'the title').click();
		defined(container.querySelector<HTMLElement>('.bar .icon'), 'the icon').click();
		expect(ontoggle).toHaveBeenCalledTimes(2);

		defined(container.querySelector<HTMLElement>('.bar wa-button'), 'Next').click();
		defined(
			container.querySelector<HTMLElement>('.bar .sound-control button'),
			'the mute toggle'
		).click();
		expect(onclick).toHaveBeenCalledTimes(1);
		expect(ontoggle).toHaveBeenCalledTimes(2);
	});

	it('says when its panel is up', () => {
		const { more } = renderTab({ expanded: true });
		expect(more).toHaveAttribute('aria-expanded', 'true');
	});

	it('steps down: title to a word, action to an icon, slider away, detail shortened, then all', async () => {
		const onclick = vi.fn();
		const at = async (room: number) => {
			const { container, unmount } = renderTab({
				layout: layoutFor(room),
				shortTitle: 'Hypno',
				detail: '0:05 / 6:49',
				shortDetail: '6:44 left',
				action: { label: 'Next', icon: 'forward-step', onclick }
			});
			await waSettled(container);
			const tab = defined(container.querySelector('section'), 'the tab');
			const labelled = [...container.querySelectorAll('wa-button')].some((button) =>
				button.textContent?.includes('Next')
			);
			const iconOnly = container.querySelector('wa-button.action-icon') !== null;
			let action: 'label' | 'icon' | null = null;
			if (labelled) {
				action = 'label';
			} else if (iconOnly) {
				action = 'icon';
			}
			const result = {
				text: container.querySelector('.text')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
				slider: !tab.classList.contains('no-slider'),
				action
			};
			unmount();
			return result;
		};
		expect(await at(2000)).toEqual({
			text: 'Bimbo Drone 0:05 / 6:49',
			slider: true,
			action: 'label'
		});
		expect(await at(520)).toEqual({ text: 'Hypno 0:05 / 6:49', slider: true, action: 'label' });
		expect(await at(420)).toEqual({ text: 'Hypno 0:05 / 6:49', slider: true, action: 'icon' });
		expect(await at(300)).toEqual({ text: 'Hypno 6:44 left', slider: false, action: 'icon' });
		expect(await at(0)).toEqual({ text: '', slider: false, action: null });
	});

	it('keeps an icon action as tall as the bar’s other controls', async () => {
		const { container, more } = renderTab({
			layout: { ...MINIMAL_LAYOUT, action: 'icon' },
			action: { label: 'Fullscreen', icon: 'expand', onclick: vi.fn() }
		});
		await waSettled(container);
		const icon = defined(container.querySelector('wa-button.action-icon'), 'the icon action');
		expect(icon.getBoundingClientRect().height).toBe(more.getBoundingClientRect().height);
	});

	it('leaves out the panel button when the bar already shows everything', () => {
		const { container } = render(MediaTab, {
			name: 'Porn',
			glyph: 'XXX',
			title: 'Porn',
			layout: WIDEST,
			more: false,
			expanded: false,
			panelId: 'porn-panel',
			ontoggle: vi.fn()
		});
		expect(container.querySelector('button.more')).toBeNull();
	});

	it('shows its own controls in full as the panel header, with the collapse button at its top', async () => {
		const onclick = vi.fn();
		const { container, more } = renderTab({
			layout: MINIMAL_LAYOUT,
			expanded: true,
			action: { label: 'Next', icon: 'forward-step', onclick }
		});
		await waSettled(container);
		const head = defined(container.querySelector('.panel-head'), 'the panel header');
		expect(head).toHaveTextContent('Bimbo Drone');
		expect(head.contains(more)).toBe(true);
		// The bar stays only to hold the tab's place, unseen and out of reach.
		const bar = defined(container.querySelector<HTMLElement>('.bar'), 'the bar');
		expect(bar.inert).toBe(true);
		expect(getComputedStyle(bar).visibility).toBe('hidden');
		expect(container.querySelector('.panel-controls wa-slider')).not.toBeNull();
		const next = defined(
			[...container.querySelectorAll<HTMLElement>('.panel-controls wa-button')].find((button) =>
				button.textContent?.includes('Next')
			),
			'Next'
		);
		next.click();
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	it('draws a text glyph in place of an icon, hidden from assistive tech', () => {
		const { container } = renderTab({ name: 'Porn', icon: null, glyph: 'XXX' });
		const glyph = defined(container.querySelector('.glyph'), 'the glyph');
		expect(glyph).toHaveTextContent('XXX');
		expect(glyph).toHaveAttribute('aria-hidden', 'true');
		expect(container.querySelector('wa-icon.icon')).toBeNull();
	});

	it('grows into its panel when expanded, the panel named and wired to the button', () => {
		const children = createRawSnippet(() => ({ render: () => '<p>panel contents</p>' }));
		const closed = renderTab({ children });
		expect(closed.container).not.toHaveTextContent('panel contents');
		closed.unmount();

		const { container, more } = renderTab({ children, expanded: true });
		const panel = defined(container.querySelector('#hypno-panel'), 'the panel');
		expect(panel).toHaveTextContent('panel contents');
		expect(panel).toHaveAttribute('aria-label', 'Hypno controls');
		// Inside the tab itself, not beside it.
		expect(container.querySelector('section.media-tab')?.contains(panel)).toBe(true);
		expect(more).toHaveAttribute('aria-controls', 'hypno-panel');
	});

	it('has no volume when there is no sound to control', () => {
		const { container } = renderTab({ name: 'Porn', channel: null });
		expect(container.querySelector('.sound-control')).toBeNull();
	});

	it('heads its panel with a linked title, a byline and the time', async () => {
		const { container } = renderTab({
			expanded: true,
			titleHref: 'https://bambicloud.com/file/x',
			byline: 'by ladybim',
			detail: '0:05 / 6:49'
		});
		await waSettled(container);
		const head = defined(container.querySelector('.panel-head'), 'the heading');
		expect(head.querySelector('a[href="https://bambicloud.com/file/x"]')).toHaveTextContent(
			'Bimbo Drone'
		);
		expect(head.querySelector('.subline')).toHaveTextContent('by ladybim 0:05 / 6:49');
	});

	it('shows no content area when what it was given renders nothing', async () => {
		const display = async (shown: boolean) => {
			const { container, unmount } = render(EmptyPanelHarness, { shown });
			await waSettled(container);
			const content = defined(container.querySelector<HTMLElement>('.panel-content'), 'content');
			const value = getComputedStyle(content).display;
			unmount();
			return value;
		};
		expect(await display(false)).toBe('none');
		expect(await display(true)).not.toBe('none');
	});

	it('keeps its header at the top, and scrolls only what is below it', async () => {
		const children = createRawSnippet(() => ({
			render: () => '<div class="tall" style="block-size: 3000px">lots</div>'
		}));
		const { container } = renderTab({ expanded: true, children });
		await waSettled(container);
		const panel = defined(container.querySelector<HTMLElement>('.panel'), 'the panel');
		const header = defined(container.querySelector<HTMLElement>('.panel-header'), 'the header');
		const scroll = defined(container.querySelector<HTMLElement>('.panel-content'), 'the body');
		expect(scroll.contains(header)).toBe(false);
		expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
		expect(panel.scrollHeight).toBe(panel.clientHeight);
		const { top } = header.getBoundingClientRect();
		scroll.scrollTop = 1000;
		expect(header.getBoundingClientRect().top).toBe(top);
	});

	it('anchored at the bottom, keeps its last item in place as what is above it grows', async () => {
		const children = createRawSnippet(() => ({
			render: () =>
				'<div><div class="grows" style="block-size: 100px"></div><p class="last">slider</p></div>'
		}));
		const { container } = renderTab({ expanded: true, children, scrollAnchor: 'bottom' });
		await waSettled(container);
		const scroll = defined(container.querySelector<HTMLElement>('.panel-content'), 'the body');
		const last = defined(container.querySelector<HTMLElement>('.last'), 'the last item');
		const grows = defined(container.querySelector<HTMLElement>('.grows'), 'what grows');
		const before = last.getBoundingClientRect().top;

		// Past what fits: the content now has to scroll, and it is the top that
		// goes out of view, not the slider.
		grows.style.blockSize = '3000px';
		await expect.poll(() => scroll.scrollTop).toBeGreaterThan(0);
		expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
		// At the end, to the pixel (scrolling rounds to whole ones).
		const fromEnd = () => scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
		expect(fromEnd()).toBeLessThanOrEqual(1);
		expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			scroll.getBoundingClientRect().bottom
		);
		expect(before).toBeGreaterThan(0);

		// Scrolled up a little, it keeps that distance from the bottom as it grows again.
		scroll.scrollTop -= 50;
		await new Promise((resolve) => requestAnimationFrame(resolve));
		const fromBottom = fromEnd();
		expect(fromBottom).toBeGreaterThan(40);
		grows.style.blockSize = '3500px';
		await expect.poll(() => Math.abs(fromEnd() - fromBottom)).toBeLessThanOrEqual(1);
	});

	it('collapses from a click on its header, but not from one on a control there', async () => {
		const onclick = vi.fn();
		const { container, ontoggle } = renderTab({
			expanded: true,
			action: { label: 'Next', icon: 'forward-step', onclick }
		});
		await waSettled(container);
		defined(container.querySelector<HTMLElement>('.panel-controls wa-button'), 'Next').click();
		expect(onclick).toHaveBeenCalledTimes(1);
		expect(ontoggle).not.toHaveBeenCalled();
		defined(container.querySelector<HTMLElement>('.panel-head .title'), 'the title').click();
		expect(ontoggle).toHaveBeenCalledTimes(1);
	});

	it('puts the action in the middle of its header’s first row when asked to', async () => {
		const { container } = renderTab({
			name: 'Settings',
			icon: 'gear',
			title: 'Settings',
			channel: null,
			detail: null,
			expanded: true,
			actionInHead: true,
			action: { label: 'Fullscreen', icon: 'expand', onclick: vi.fn() }
		});
		await waSettled(container);
		const head = defined(container.querySelector<HTMLElement>('.panel-head'), 'the header row');
		const button = defined(head.querySelector<HTMLElement>('wa-button'), 'Fullscreen');
		expect(button).toHaveTextContent('Fullscreen');
		// No second row with nothing in it.
		expect(container.querySelector('.panel-controls')).toBeNull();
		const row = head.getBoundingClientRect();
		const box = button.getBoundingClientRect();
		expect(Math.abs(box.left - row.left - (row.right - box.right))).toBeLessThan(1);
	});

	it('floats its panel centred over the dock, the tab keeping its place under it', async () => {
		const frame = document.createElement('div');
		frame.style.cssText =
			'position: relative; display: flex; inline-size: 900px; block-size: 600px';
		document.body.append(frame);
		try {
			const before = render(MediaTab, {
				target: frame,
				props: {
					name: 'Hypno',
					title: 'Bimbo Drone',
					layout: MINIMAL_LAYOUT,
					expanded: false,
					panelId: 'hypno-panel',
					ontoggle: vi.fn()
				}
			});
			await waSettled(frame);
			const tab = defined(frame.querySelector<HTMLElement>('section.media-tab'), 'the tab');
			const place = tab.getBoundingClientRect();
			await before.rerender({ expanded: true });
			await waSettled(frame);
			const panel = defined(frame.querySelector<HTMLElement>('.panel'), 'the panel');
			// Grown to its full width: 48rem, in a dock wider than that.
			await expect.poll(() => panel.getBoundingClientRect().width).toBe(768);
			expect(tab.getBoundingClientRect()).toEqual(place);
			const box = panel.getBoundingClientRect();
			const outer = frame.getBoundingClientRect();
			expect(Math.abs(box.left - outer.left - (outer.right - box.right))).toBeLessThan(1);
			expect(Math.abs(box.bottom - outer.bottom)).toBeLessThan(1);
			before.unmount();
		} finally {
			frame.remove();
		}
	});
});
