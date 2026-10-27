import { afterEach, describe, expect, it } from 'vitest';
import { keepConfetti } from './confetti';

/** Waits for a resize to have been answered. */
const settled = () =>
	new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

afterEach(() => {
	document.body.replaceChildren();
});

describe('a layer of confetti', () => {
	it('grows with the menu, keeping the pieces it had, and shrinks with it', async () => {
		const layer = document.createElement('span');
		layer.style.cssText = 'display: block; position: relative; width: 25rem; height: 40rem';
		document.body.append(layer);
		const stop = keepConfetti(layer);
		await settled();
		expect(layer.children).toHaveLength(100);
		const first = layer.firstElementChild;

		layer.style.width = '50rem';
		await settled();
		expect(layer.children).toHaveLength(200);
		expect(layer.contains(first)).toBe(true);

		layer.style.width = '12.5rem';
		await settled();
		expect(layer.children).toHaveLength(50);
		expect(layer.contains(first)).toBe(true);
		stop();
	});
});
