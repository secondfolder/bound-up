import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdUntilFloor, startTimer } from './response-floor';

describe('holdUntilFloor', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('waits out what is left of the floor', async () => {
		const started = startTimer();
		vi.advanceTimersByTime(300);
		let done = false;
		const held = holdUntilFloor(started, 1000).then(() => {
			done = true;
		});
		await vi.advanceTimersByTimeAsync(699);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await held;
		expect(done).toBe(true);
	});

	it('does not wait once the floor has passed', async () => {
		const started = startTimer();
		vi.advanceTimersByTime(1500);
		await expect(holdUntilFloor(started, 1000)).resolves.toBeUndefined();
	});
});
