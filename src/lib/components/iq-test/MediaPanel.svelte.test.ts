import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';
import MediaPanel from './MediaPanel.svelte';

/**
 * Real pictures, made here, so they load as a feed's would, each its own
 * colour: 3:4, the shape a picture is guessed at, so the fitting is the same
 * before and after they load.
 */
function pictures(count: number, width = 30, height = 40): string[] {
	return Array.from({ length: count }, (_, i) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (context) {
			context.fillStyle = `hsl(${(i * 37) % 360} 80% 50%)`;
			context.fillRect(0, 0, width, height);
		}
		return canvas.toDataURL();
	});
}

const images = pictures(12);

/** Do something to a popover and wait for its `toggle`, which the browser fires as a task of its own. */
async function toggled(item: HTMLElement, act: () => void) {
	const done = new Promise((resolve) => item.addEventListener('toggle', resolve, { once: true }));
	act();
	await done;
	await tick();
}

/**
 * Render into a box of a given size, as the page's band or strip gives it:
 * a panel fills its box, so with none it has room for only one.
 */
function renderPanel(
	props: Omit<Parameters<typeof render<typeof MediaPanel>>[1] & object, never>,
	size = { width: 300, height: 1250 }
) {
	const box = document.createElement('div');
	box.style.cssText = `display: block; inline-size: ${size.width}px; block-size: ${size.height}px`;
	document.body.append(box);
	const view = render(MediaPanel, { target: box, props: props as never });
	return { ...view, box };
}

/**
 * How many places the panel shows. Polled: it learns its box's size a frame
 * after it renders, and fits to it then.
 */
function slotCount(container: ParentNode): number {
	return container.querySelectorAll('.slot').length;
}

/** Each slot's length along the panel, and the panel's own. */
function lengths(container: ParentNode, axis: 'height' | 'width') {
	const panel = defined(container.querySelector<HTMLElement>('.media-panel'), 'the panel');
	const slots = [...panel.querySelectorAll<HTMLElement>('.slot')].map(
		(slot) => slot.getBoundingClientRect()[axis]
	);
	return { panel: panel.getBoundingClientRect()[axis], slots };
}

/** The picture on show in a slot: not the one loading out of sight. */
const showing = (slot: Element) => slot.querySelector('img:not(.preload)')?.getAttribute('src');

function button(slot: Element, name: string): HTMLButtonElement {
	return defined(
		slot.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`),
		`the "${name}" button`
	);
}

/** The first place, once its picture is up. */
async function firstSlot(container: HTMLElement): Promise<HTMLElement> {
	await vi.waitUntil(() => slotCount(container) > 0);
	const slot = defined(container.querySelector<HTMLElement>('.slot'), 'a place');
	await vi.waitUntil(() => showing(slot));
	return slot;
}

describe('MediaPanel', () => {
	it('enlarges a picture in place, the same element, from its Enlarge button', async () => {
		const { container } = renderPanel({ images, clips: [], offset: 0 });
		const slot = await firstSlot(container);
		const enlarge = button(slot, 'Enlarge picture');
		const item = defined(enlarge.closest<HTMLElement>('.item'), 'its item');
		const img = defined(item.querySelector('img'), 'its picture');
		const before = item.getBoundingClientRect().width;

		await toggled(item, () => enlarge.click());
		expect(item.matches(':popover-open')).toBe(true);
		expect(item).toHaveAttribute('role', 'dialog');
		expect(item.querySelector('img')).toBe(img);
		expect(item.getBoundingClientRect().width).not.toBe(before);

		await waSettled(container);
		const close = defined(item.querySelector<HTMLElement>('wa-button.close'), 'its close button');
		await toggled(item, () => close.click());
		expect(item.matches(':popover-open')).toBe(false);
	});

	it('does nothing for a click on the picture itself: only its buttons do anything', async () => {
		const { container } = renderPanel({ images, clips: [], offset: 0 });
		const slot = await firstSlot(container);
		const item = defined(slot.querySelector<HTMLElement>('.item'), 'its item');
		const src = showing(slot);
		defined(slot.querySelector<HTMLElement>('img'), 'its picture').click();
		await tick();
		expect(item.matches(':popover-open')).toBe(false);
		expect(showing(slot)).toBe(src);
	});

	it('offers back, keep and next beside Enlarge, back only once there is something to go back to', async () => {
		const { container } = renderPanel({ images, clips: [], offset: 0 });
		const slot = await firstSlot(container);
		const toolbar = defined(slot.querySelector('.toolbar'), 'its buttons');
		expect(
			[...toolbar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))
		).toEqual(['Previous picture', 'Keep this picture', 'Next picture', 'Enlarge picture']);
		expect(button(slot, 'Previous picture')).toBeDisabled();
		expect(button(slot, 'Keep this picture')).toHaveAttribute('aria-pressed', 'false');
	});

	it('moves on to another with Next, keeping the old one up until the new has loaded, and back again', async () => {
		const { container } = renderPanel({ images, clips: [], offset: 0 });
		const slot = await firstSlot(container);
		const first = showing(slot);

		button(slot, 'Next picture').click();
		await tick();
		// Until it has loaded: the old one, with a bar along its foot.
		expect(showing(slot)).toBe(first);
		expect(slot.querySelector('.loading-bar')).not.toBeNull();
		await expect.poll(() => showing(slot)).not.toBe(first);
		expect(slot.querySelector('.loading-bar')).toBeNull();

		expect(button(slot, 'Previous picture')).toBeEnabled();
		button(slot, 'Previous picture').click();
		await expect.poll(() => showing(slot)).toBe(first);
	});

	it('keeps one locked through the rotation and a new feed, while the rest move on', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		try {
			const view = renderPanel({ images, clips: [], offset: 0 });
			const slot = await firstSlot(view.container);
			await expect.poll(() => slotCount(view.container)).toBe(3);
			const others = () =>
				[...view.container.querySelectorAll('.slot')].slice(1).map((other) => showing(other));
			await expect.poll(() => others().every(Boolean)).toBe(true);
			const kept = showing(slot);
			const before = others();

			button(slot, 'Keep this picture').click();
			await tick();
			expect(button(slot, 'Keep this picture')).toHaveAttribute('aria-pressed', 'true');
			// Locked shows without hovering: a mark in its corner.
			expect(slot.querySelector('.locked-mark')).not.toBeNull();

			vi.advanceTimersByTime(7000);
			await expect.poll(others).not.toEqual(before);
			expect(showing(slot)).toBe(kept);

			// "New porn": a new order of the feed.
			const after = others();
			await view.rerender({ images: [...images].reverse() });
			await expect.poll(others).not.toEqual(after);
			expect(showing(slot)).toBe(kept);
		} finally {
			vi.useRealTimers();
		}
	});

	it('says under the buttons what the one pointed at does, unclipped, without moving them', async () => {
		const { container } = renderPanel({ images, clips: [], offset: 0 });
		const slot = await firstSlot(container);
		const caption = defined(slot.querySelector<HTMLElement>('.caption'), 'the caption');
		const lock = button(slot, 'Keep this picture');
		const before = lock.getBoundingClientRect();
		expect(caption.matches(':popover-open')).toBe(false);

		lock.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
		await tick();
		// In the top layer, so the column cannot clip a long one.
		expect(caption.matches(':popover-open')).toBe(true);
		expect(caption.textContent).toBe('Keep this picture, so it is never swapped out');
		expect(lock.getBoundingClientRect()).toEqual(before);
		// Below the row.
		expect(caption.getBoundingClientRect().top).toBeGreaterThan(before.bottom);

		// Pressed, it says what pressing again does.
		lock.click();
		await vi.waitUntil(() => caption.textContent?.startsWith('Kept'));

		button(slot, 'Next picture').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
		await tick();
		expect(caption.textContent).toBe('Show another picture');

		defined(slot.querySelector('.toolbar'), 'its buttons').dispatchEvent(
			new PointerEvent('pointerleave')
		);
		await vi.waitUntil(() => !caption.matches(':popover-open'));
	});

	it('wraps its buttons onto more rows in a small item before shrinking them', async () => {
		const { container } = renderPanel(
			{ images, clips: [], offset: 0, stride: 1, orientation: 'row' },
			{ width: 400, height: 144 }
		);
		const slot = await firstSlot(container);
		const sizes = [...slot.querySelectorAll<HTMLElement>('.toolbar .control')].map((control) =>
			control.getBoundingClientRect()
		);
		// Two rows of two at 144px high, each still a usable size.
		expect(new Set(sizes.map((size) => Math.round(size.top))).size).toBe(2);
		expect(Math.min(...sizes.map((size) => size.width))).toBeGreaterThanOrEqual(30);
	});

	it('marks a kept one with a see-through, shadowed lock, not a solid badge', async () => {
		const { container } = renderPanel({ images, clips: [], offset: 0 });
		const slot = await firstSlot(container);
		button(slot, 'Keep this picture').click();
		await tick();
		const mark = defined(slot.querySelector<HTMLElement>('.locked-mark'), 'the mark');
		const style = getComputedStyle(mark);
		expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(style.color).toMatch(/rgba\(255, 255, 255, 0\.\d+\)/);
		expect(style.filter).toContain('drop-shadow');
	});

	it('names where each picture is from over its buttons, linked to it in a new tab', async () => {
		const posts = Object.fromEntries(
			images.map((image, n) => [
				image,
				{ title: `Post ${n}`, page: `https://www.reddit.com/r/test/comments/${n}/` }
			])
		);
		const { container } = renderPanel({ images, clips: [], origins: posts, offset: 0 });
		const slot = await firstSlot(container);
		const index = images.indexOf(defined(showing(slot), 'its picture'));
		const link = defined(slot.querySelector<HTMLAnchorElement>('.toolbar a.origin'), 'its link');
		expect(link).toHaveTextContent(`Post ${index}`);
		expect(link.href).toBe(`https://www.reddit.com/r/test/comments/${index}/`);
		expect(link.target).toBe('_blank');
		expect(link.rel).toContain('noreferrer');
		// Above the buttons.
		expect(link.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			button(slot, 'Next picture').getBoundingClientRect().top
		);
	});

	it('says nothing of where a picture is from when the feed does not know', async () => {
		const { container } = renderPanel({ images, clips: [], offset: 0 });
		const slot = await firstSlot(container);
		expect(slot.querySelector('a.origin')).toBeNull();
	});

	it('holds a picture while it is pointed at, and gives one gone back to its full time', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		try {
			const { container } = renderPanel(
				{ images, clips: [], offset: 0 },
				{ width: 300, height: 400 }
			);
			const slot = await firstSlot(container);
			const first = showing(slot);
			slot.dispatchEvent(new PointerEvent('pointerenter'));
			vi.advanceTimersByTime(20_000);
			await tick();
			expect(showing(slot)).toBe(first);

			// Let go, it has its time from where it stopped: most of it still to come.
			slot.dispatchEvent(new PointerEvent('pointerleave'));
			vi.advanceTimersByTime(6000);
			await tick();
			expect(showing(slot)).toBe(first);

			// On to the next by hand, then back: the clock starts again each time.
			button(slot, 'Next picture').click();
			await expect.poll(() => showing(slot)).not.toBe(first);
			button(slot, 'Previous picture').click();
			await expect.poll(() => showing(slot)).toBe(first);
			vi.advanceTimersByTime(6000);
			await tick();
			expect(showing(slot)).toBe(first);
			vi.advanceTimersByTime(1000);
			await expect.poll(() => slot.querySelector('img.preload')).not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('shows its buttons on a tap, which a touchscreen has no hover for, and hides them on another', async () => {
		const { container } = renderPanel({ images, clips: [], offset: 0 });
		const slot = await firstSlot(container);
		const item = defined(slot.querySelector<HTMLElement>('.item'), 'its item');
		const tap = () =>
			item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
		const toolbar = defined(slot.querySelector<HTMLElement>('.toolbar'), 'its buttons');
		expect(getComputedStyle(toolbar).pointerEvents).toBe('none');
		tap();
		await tick();
		expect(item.classList.contains('revealed')).toBe(true);
		expect(getComputedStyle(toolbar).pointerEvents).toBe('auto');
		tap();
		await tick();
		expect(item.classList.contains('revealed')).toBe(false);
	});

	it('holds still while a picture is enlarged, and moves on once it is put back', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		try {
			const { container } = renderPanel(
				{ images, clips: [], offset: 0 },
				{ width: 300, height: 400 }
			);
			const slot = await firstSlot(container);
			const item = defined(slot.querySelector<HTMLElement>('.item'), 'the picture');
			await toggled(item, () => button(slot, 'Enlarge picture').click());
			const shown = showing(slot);
			vi.advanceTimersByTime(20_000);
			await tick();
			expect(showing(slot)).toBe(shown);

			await toggled(item, () => item.hidePopover());
			vi.advanceTimersByTime(7000);
			await expect.poll(() => showing(slot)).not.toBe(shown);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leads with the hypno when given it, enlargeable, titled and scrubbable like a clip', () => {
		const lead = createRawSnippet(() => ({ render: () => '<video class="lead"></video>' }));
		const leadOrigin = { title: 'Bimbo Drone PMV', page: 'https://pmvhaven.com/video/x' };
		const { container } = renderPanel({ images, clips: [], offset: 0, lead, leadOrigin });
		const first = defined(container.querySelector('.item'), 'the first item');
		expect(first.querySelector('video.lead')).not.toBeNull();
		expect(first.querySelector('button[aria-label="Enlarge hypno"]')).not.toBeNull();
		const link = defined(first.querySelector<HTMLAnchorElement>('a.origin'), 'its link');
		expect(link).toHaveTextContent('Bimbo Drone PMV');
		expect(link.href).toBe('https://pmvhaven.com/video/x');
		expect(first.querySelector('input.scrub')).toHaveAccessibleName('Position in the hypno');
	});

	it('shows a different picture in each column sharing the feed', async () => {
		const shown: (string | null | undefined)[] = [];
		for (const offset of [0, 1, 2, 3]) {
			const { container, unmount } = renderPanel(
				{ images, clips: [], offset, stride: 4 },
				{ width: 300, height: 400 }
			);
			shown.push(showing(await firstSlot(container)));
			unmount();
		}
		expect(new Set(shown).size).toBe(4);
	});

	it('fills a column exactly, top to bottom, and drops pictures as it gets shorter', async () => {
		const tall = renderPanel({ images, clips: [], offset: 0 }, { width: 300, height: 1250 });
		await expect.poll(() => slotCount(tall.container)).toBe(3);
		const filled = lengths(tall.container, 'height');
		// 3:4, so 400px each at 300px wide: three.
		const used = filled.slots.reduce((sum, length) => sum + length, 0) + 8 * 2;
		expect(Math.abs(used - filled.panel)).toBeLessThan(2);
		tall.unmount();

		const short = renderPanel({ images, clips: [], offset: 0 }, { width: 300, height: 820 });
		await expect.poll(() => slotCount(short.container)).toBe(2);
	});

	it('fills a strip exactly, side to side, adding pictures as it gets wider', async () => {
		const narrow = renderPanel(
			{ images, clips: [], offset: 0, stride: 1, orientation: 'row' },
			{ width: 400, height: 144 }
		);
		await expect.poll(() => slotCount(narrow.container)).toBe(4);
		const few = lengths(narrow.container, 'width');
		const used = few.slots.reduce((sum, length) => sum + length, 0) + 8 * (few.slots.length - 1);
		expect(Math.abs(used - few.panel)).toBeLessThan(2);
		narrow.unmount();

		const wide = renderPanel(
			{ images, clips: [], offset: 0, stride: 1, orientation: 'row' },
			{ width: 1000, height: 144 }
		);
		await expect.poll(() => slotCount(wide.container)).toBe(9);
	});

	it('gives up after a few pictures in a row will not load, rather than trying the whole feed', async () => {
		const broken = Array.from({ length: 30 }, (_, i) => `/missing-${i}.jpg`);
		const { container } = renderPanel(
			{ images: broken, clips: [], offset: 0, stride: 1 },
			{ width: 300, height: 400 }
		);
		await expect.poll(() => slotCount(container)).toBe(1);
		const slot = defined(container.querySelector('.slot'), 'the place');
		await expect.poll(() => slot.querySelector('.loading-bar')).toBeNull();
		expect(Number(showing(slot)?.match(/missing-(?<n>\d+)/)?.groups?.n)).toBeLessThan(5);
	});
});
