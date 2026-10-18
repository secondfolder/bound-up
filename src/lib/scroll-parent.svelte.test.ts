import { afterEach, describe, expect, it } from 'vitest';
import { followEnd } from './scroll-parent';

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
function conversation({ heldRoot = false } = {}) {
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
	cleanup = followEnd(list);
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
});
