import { afterEach, describe, expect, it } from 'vitest';
import { PLAYING, playWhilePointedAt } from './play-on-hover';

/** A menu with a title, which pulses while marked, as a design would have it. */
function menuWithCourse() {
	const style = document.createElement('style');
	style.textContent =
		'@keyframes pulse { 50% { opacity: 0.5; } } .menu-title[data-playing] { animation: pulse 200ms linear infinite; }';
	const menu = document.createElement('section');
	const course = document.createElement('div');
	course.className = 'menu-title';
	menu.append(course);
	document.body.append(style, menu);
	const stop = playWhilePointedAt(menu);
	return { menu, course, stop };
}

const over = (element: HTMLElement) =>
	element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
const out = (element: HTMLElement) =>
	element.dispatchEvent(
		new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body })
	);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
	document.body.replaceChildren();
});

describe('playing what is pointed at', () => {
	it('marks a part while pointed at, and lets its animation finish its cycle once left', async () => {
		const { course, stop } = menuWithCourse();
		over(course);
		expect(course.hasAttribute(PLAYING)).toBe(true);
		const [pulse] = course.getAnimations();
		expect(pulse?.effect?.getComputedTiming().iterations).toBe(Number.POSITIVE_INFINITY);

		await wait(250);
		const cycle = pulse?.effect?.getComputedTiming().currentIteration ?? 0;
		out(course);
		// Still marked, to the end of the cycle it is in, and no further.
		expect(course.hasAttribute(PLAYING)).toBe(true);
		expect(pulse?.effect?.getComputedTiming().iterations).toBe(cycle + 1);
		await wait(300);
		expect(course.hasAttribute(PLAYING)).toBe(false);
		expect(course.getAnimations()).toHaveLength(0);
		stop();
	});

	it('plays on if the pointer comes back before it has come to rest', async () => {
		const { course, stop } = menuWithCourse();
		over(course);
		await wait(50);
		out(course);
		over(course);
		const [pulse] = course.getAnimations();
		expect(pulse?.effect?.getComputedTiming().iterations).toBe(Number.POSITIVE_INFINITY);
		await wait(400);
		expect(course.hasAttribute(PLAYING)).toBe(true);
		stop();
	});
});
