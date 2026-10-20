import { describe, expect, it } from 'vitest';
import { CATCH_UP_SECONDS, cutAt, MIN_RATE, revealStep, sharedStart } from './reveal';

describe('revealStep', () => {
	it('never passes what has arrived, and stays put once there', () => {
		expect(revealStep(0, 10, 10_000)).toBe(10);
		expect(revealStep(10, 10, 16)).toBe(10);
	});

	it('goes at least the minimum rate', () => {
		expect(revealStep(0, 1, 100)).toBe(Math.min(1, MIN_RATE / 10));
		expect(revealStep(0, 1000, 1000 / MIN_RATE)).toBeGreaterThanOrEqual(1);
	});

	it('goes faster the further behind it is, catching up with a burst quickly', () => {
		const small = revealStep(0, 20, 16);
		const large = revealStep(0, 2000, 16);
		expect(large).toBeGreaterThan(small);
		const shownAfter = (target: number, seconds: number) => {
			let shown = 0;
			for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 16) {
				shown = revealStep(shown, target, 16);
			}
			return shown;
		};
		// A few words arrive at once: caught up within the time constant.
		expect(shownAfter(30, CATCH_UP_SECONDS)).toBe(30);
		// Even a whole passage at once is mostly shown in a second, and all of it soon after.
		expect(shownAfter(2000, 1)).toBeGreaterThan(1800);
		expect(shownAfter(2000, 2.5)).toBe(2000);
	});

	it('treats a clock that went backwards as no time', () => {
		expect(revealStep(5, 10, -50)).toBe(5);
	});
});

describe('cutAt', () => {
	it('cuts at whole characters, never inside a surrogate pair', () => {
		const text = 'a🙂b';
		expect(cutAt(text, 1.7)).toBe(1);
		expect(cutAt(text, 2)).toBe(3);
		expect(cutAt(text, 99)).toBe(text.length);
		expect(cutAt(text, -1)).toBe(0);
	});
});

describe('sharedStart', () => {
	it('is how much of the old text the new one still starts with', () => {
		expect(sharedStart('She says <s', 'She says "Hi')).toBe(9);
		expect(sharedStart('abc', 'abcdef')).toBe(3);
		expect(sharedStart('', 'abc')).toBe(0);
	});
});
