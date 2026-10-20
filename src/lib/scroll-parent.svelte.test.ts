import { afterEach, describe, expect, it, vi } from 'vitest';
import { followEnd, heldScrollTop } from './scroll-parent';

/** A frame for the observers to report in: ResizeObserver delivers before the next paint. */
const frame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done)));

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	document.body.replaceChildren();
});

/**
 * A 200px scrollport, as `<main>` is in the app shell, around a list taller than it.
 * With `heldRoot`, the list sits in a page root held to the scrollport's height,
 * which the list overflows, as the daydream page's does.
 */
function conversation({
	heldRoot = false,
	holdAt,
	smoothAfter
}: {
	heldRoot?: boolean;
	holdAt?: () => Element | null;
	smoothAfter?: number;
} = {}) {
	const scroller = document.createElement('div');
	scroller.style.cssText = 'height: 200px; overflow-y: auto';
	const list = document.createElement('ul');
	if (heldRoot) {
		const root = document.createElement('section');
		root.style.cssText = 'height: 200px';
		root.append(list);
		scroller.append(root);
	} else {
		scroller.append(list);
	}
	document.body.append(scroller);
	const add = (height: number) => {
		const item = document.createElement('li');
		item.style.height = `${height}px`;
		list.append(item);
		return item;
	};
	add(500);
	cleanup = followEnd(list, {
		...(holdAt ? { holdAt } : {}),
		...(smoothAfter === undefined ? {} : { smoothAfter })
	});
	const atEnd = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 1;
	return { scroller, add, atEnd };
}

describe('followEnd', () => {
	it('opens at the end', () => {
		const { atEnd } = conversation();
		expect(atEnd()).toBe(true);
	});

	it('follows what is added, and what grows, while the reader is at the end', async () => {
		const { add, atEnd } = conversation();
		await frame();
		const streaming = add(100);
		await frame();
		expect(atEnd()).toBe(true);
		streaming.style.height = '400px';
		await frame();
		expect(atEnd()).toBe(true);
	});

	it('leaves a reader who has scrolled up where they are', async () => {
		const { scroller, add } = conversation();
		await frame();
		scroller.scrollTop = 0;
		await frame();
		add(300);
		await frame();
		expect(scroller.scrollTop).toBe(0);
	});

	it('follows again once the reader scrolls back to the end', async () => {
		const { scroller, add, atEnd } = conversation();
		await frame();
		scroller.scrollTop = 0;
		await frame();
		scroller.scrollTop = scroller.scrollHeight;
		await frame();
		add(300);
		await frame();
		expect(atEnd()).toBe(true);
	});

	it('follows content that overflows a page root held to the scrollport’s height', async () => {
		const { add, atEnd } = conversation({ heldRoot: true });
		expect(atEnd()).toBe(true);
		await frame();
		add(300);
		await frame();
		expect(atEnd()).toBe(true);
	});

	it('goes on following after a scroll down that stops short of the end', async () => {
		// The shape of the browser's scroll anchoring as an earlier turn opens,
		// which once stopped a daydream following as it loaded.
		const { scroller, add, atEnd } = conversation();
		await frame();
		add(300);
		scroller.scrollTop += 100;
		await frame();
		add(300);
		await frame();
		expect(atEnd()).toBe(true);
	});

	it('stops following once a held element reaches the top, and goes on to the end while it is short', async () => {
		let held: HTMLElement | null = null;
		const { scroller, add, atEnd } = conversation({ holdAt: () => held });
		await frame();
		held = add(100);
		await frame();
		// Shorter than the scrollport: followed to the end as usual.
		expect(atEnd()).toBe(true);
		held.style.height = '600px';
		await frame();
		// Its top (500px down) is held a little below the top of the scrollport.
		expect(scroller.scrollTop).toBe(492);
		expect(atEnd()).toBe(false);
		add(300);
		await frame();
		expect(scroller.scrollTop).toBe(492);
	});

	it('jumps while the conversation opens, and glides to what arrives after', async () => {
		const opening = conversation();
		const jumps = vi.spyOn(opening.scroller, 'scrollTo');
		await frame();
		opening.add(100);
		await frame();
		// Still opening: straight there, with no glide down the conversation.
		expect(jumps).not.toHaveBeenCalled();
		expect(opening.atEnd()).toBe(true);
		cleanup?.();
		document.body.replaceChildren();

		const opened = conversation({ smoothAfter: 0 });
		const glides = vi.spyOn(opened.scroller, 'scrollTo');
		await frame();
		opened.add(100);
		await frame();
		expect(glides).toHaveBeenLastCalledWith({ top: 400, behavior: 'smooth' });
		await expect.poll(opened.atEnd).toBe(true);
	});

	it('jumps, rather than glides, further than a screen', async () => {
		const { scroller, add, atEnd } = conversation({ smoothAfter: 0 });
		const glides = vi.spyOn(scroller, 'scrollTo');
		await frame();
		add(1000);
		await frame();
		expect(glides).not.toHaveBeenCalled();
		expect(atEnd()).toBe(true);
	});

	it('never moves a reader up to a held element they have scrolled past', async () => {
		let held: HTMLElement | null = null;
		const { scroller, add } = conversation({ holdAt: () => held });
		await frame();
		held = add(600);
		await frame();
		scroller.scrollTop = 800;
		await frame();
		add(100);
		await frame();
		expect(scroller.scrollTop).toBe(800);
	});
});

describe('heldScrollTop', () => {
	it('goes towards the end, no further than a little above the held top, never up', () => {
		expect(heldScrollTop(0, 300, 1000)).toBe(300);
		expect(heldScrollTop(0, 1000, 500)).toBe(492);
		expect(heldScrollTop(700, 1000, 500)).toBe(700);
	});
});
