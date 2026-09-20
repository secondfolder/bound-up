import { describe, expect, it } from 'vitest';
import { embedActivationDelayMs } from './embed-activation';

/**
 * The thresholds are a judgement call, so what is asserted here is the shape
 * they have to keep: never hold back something the reader is looking at, and
 * never fire off a lookup for something they are flying past.
 */
describe('embedActivationDelayMs', () => {
	it('loads immediately when the embed is well inside the scrollport', () => {
		expect(
			embedActivationDelayMs({ intersectionRatio: 0.6, distancePx: 0, velocityPxPerMs: 4 })
		).toBe(0);
	});

	it('loads immediately when the reader has stopped', () => {
		expect(
			embedActivationDelayMs({ intersectionRatio: 0, distancePx: 300, velocityPxPerMs: 0 })
		).toBe(0);
	});

	it('loads immediately just off the edge at a readable speed', () => {
		expect(
			embedActivationDelayMs({ intersectionRatio: 0, distancePx: 40, velocityPxPerMs: 0.9 })
		).toBe(0);
	});

	it('waits longer the faster the reader is scrolling past', () => {
		const slow = embedActivationDelayMs({
			intersectionRatio: 0,
			distancePx: 300,
			velocityPxPerMs: 0.5
		});
		const brisk = embedActivationDelayMs({
			intersectionRatio: 0,
			distancePx: 300,
			velocityPxPerMs: 1.2
		});
		const flung = embedActivationDelayMs({
			intersectionRatio: 0,
			distancePx: 300,
			velocityPxPerMs: 3
		});
		expect(slow).toBeLessThan(brisk);
		expect(brisk).toBeLessThan(flung);
	});

	// Direction is not a signal: scrolling back up past an embed is the same
	// decision as scrolling down past it.
	it('ignores the sign of the velocity', () => {
		const input = { intersectionRatio: 0, distancePx: 300 };
		expect(embedActivationDelayMs({ ...input, velocityPxPerMs: -2 })).toBe(
			embedActivationDelayMs({ ...input, velocityPxPerMs: 2 })
		);
	});
});
