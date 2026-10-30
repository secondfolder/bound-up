import { describe, expect, it } from 'vitest';
import { ANSWER_MS, QUIET_STEPS_MS, StillListening, WARN_MS } from './still-listening.svelte';

const MINUTE = 60_000;

function clock() {
	let time = 0;
	return {
		now: () => time,
		pass: (ms: number) => {
			time += ms;
		}
	};
}

describe('StillListening', () => {
	it('asks after two quiet minutes of Keep going, and not before', () => {
		const { now, pass } = clock();
		const still = new StillListening(now);
		pass(2 * MINUTE - 1000);
		expect(still.tick(true)).toBe(null);
		pass(1000);
		expect(still.tick(true)).toBe('ask');
		expect(still.asking).toBe(true);
	});

	it('never asks while nothing is running, and drops the question when it stops', () => {
		const { now, pass } = clock();
		const still = new StillListening(now);
		pass(30 * MINUTE);
		expect(still.tick(false)).toBe(null);
		expect(still.tick(true)).toBe('ask');
		expect(still.tick(false)).toBe(null);
		expect(still.asking).toBe(false);
	});

	it('starts the wait again on any activity', () => {
		const { now, pass } = clock();
		const still = new StillListening(now);
		pass(MINUTE + 59_000);
		still.active();
		pass(MINUTE);
		expect(still.tick(true)).toBe(null);
	});

	it('waits two, then five, then ten minutes, and ten from then on', () => {
		const { now, pass } = clock();
		const still = new StillListening(now);
		const waits: number[] = [];
		for (let ask = 0; ask < 5; ask += 1) {
			let waited = 0;
			while (still.tick(true) !== 'ask') {
				pass(1000);
				waited += 1000;
			}
			waits.push(waited);
			still.answer(true);
		}
		expect(waits).toEqual([2, 5, 10, 10, 10].map((minutes) => minutes * MINUTE));
		expect(QUIET_STEPS_MS.at(-1)).toBe(10 * MINUTE);
	});

	it('warns at fifteen seconds unanswered and pauses at thirty', () => {
		const { now, pass } = clock();
		const still = new StillListening(now);
		pass(2 * MINUTE);
		expect(still.tick(true)).toBe('ask');
		pass(WARN_MS - 1000);
		expect(still.tick(true)).toBe(null);
		pass(1000);
		expect(still.tick(true)).toBe('warn');
		expect(still.tick(true)).toBe(null);
		pass(ANSWER_MS - WARN_MS);
		expect(still.tick(true)).toBe('pause');
		expect(still.asking).toBe(false);
	});

	it('ignores activity while asking: only the answer counts', () => {
		const { now, pass } = clock();
		const still = new StillListening(now);
		pass(2 * MINUTE);
		still.tick(true);
		still.active();
		pass(ANSWER_MS);
		expect(still.tick(true)).toBe('pause');
	});

	it('does not lengthen the wait for a no', () => {
		const { now, pass } = clock();
		const still = new StillListening(now);
		pass(2 * MINUTE);
		still.tick(true);
		still.answer(false);
		expect(still.quietFor).toBe(2 * MINUTE);
	});
});
