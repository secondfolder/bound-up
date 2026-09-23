import { describe, expect, it } from 'vitest';
import { createLimiter, mapWithConcurrency } from './concurrency';

/** A promise whose settling the test controls. */
function deferred<T = void>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Lets every already-queued promise callback run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createLimiter', () => {
	it('never runs more than max tasks at once', async () => {
		const limit = createLimiter(3);
		const gates = Array.from({ length: 10 }, () => deferred());
		let active = 0;
		let peak = 0;
		const done = gates.map((gate) =>
			limit(async () => {
				active += 1;
				peak = Math.max(peak, active);
				await gate.promise;
				active -= 1;
			})
		);

		await flush();
		expect(active).toBe(3);
		for (const gate of gates) {
			gate.resolve();
			await flush();
			expect(active).toBeLessThanOrEqual(3);
		}
		await Promise.all(done);
		expect(peak).toBe(3);
		expect(active).toBe(0);
	});

	it('starts queued tasks in the order they were added', async () => {
		const limit = createLimiter(1);
		const started: number[] = [];
		await Promise.all(
			[0, 1, 2, 3].map((n) =>
				limit(() => {
					started.push(n);
					return Promise.resolve();
				})
			)
		);
		expect(started).toEqual([0, 1, 2, 3]);
	});

	it('passes results and rejections through to the caller', async () => {
		const limit = createLimiter(2);
		await expect(limit(async () => 'ok')).resolves.toBe('ok');
		await expect(limit(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
	});

	it('frees the slot when a task fails, including a synchronous throw', async () => {
		const limit = createLimiter(1);
		await expect(
			limit(() => {
				throw new Error('sync');
			})
		).rejects.toThrow('sync');
		await expect(limit(async () => Promise.reject(new Error('async')))).rejects.toThrow('async');
		await expect(limit(async () => 'still running')).resolves.toBe('still running');
	});

	it('rejects a limit that is not a positive integer', () => {
		expect(() => createLimiter(0)).toThrow();
		expect(() => createLimiter(1.5)).toThrow();
	});
});

describe('mapWithConcurrency', () => {
	it('keeps input order and caps how many run at once', async () => {
		let active = 0;
		let peak = 0;
		const results = await mapWithConcurrency([5, 1, 4, 2, 3, 0], 3, async (n) => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, n));
			active -= 1;
			return n * 10;
		});
		expect(results).toEqual([50, 10, 40, 20, 30, 0]);
		expect(peak).toBe(3);
	});
});
