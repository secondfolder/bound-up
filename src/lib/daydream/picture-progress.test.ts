import { describe, expect, it } from 'vitest';
import { AT_ESTIMATE, pictureProgress } from './picture-progress';

describe('pictureProgress', () => {
	it('starts empty and is two thirds full at the estimate', () => {
		expect(pictureProgress(0, 10_000)).toBe(0);
		expect(pictureProgress(5000, 10_000)).toBeCloseTo(1 / 3);
		expect(pictureProgress(10_000, 10_000)).toBeCloseTo(AT_ESTIMATE);
	});

	it('keeps filling past the estimate, slower and slower, and never fills', () => {
		const at = (seconds: number) => pictureProgress(seconds * 1000, 10_000);
		expect(at(15)).toBeGreaterThan(at(10));
		expect(at(20)).toBeGreaterThan(at(15));
		expect(at(20) - at(15)).toBeLessThan(at(15) - at(10));
		expect(at(600)).toBeLessThan(1);
		expect(at(60)).toBeGreaterThan(0.99);
	});

	it('slows without a kink: as fast just past the estimate as just before it', () => {
		const step = 10;
		const before = pictureProgress(10_000, 10_000) - pictureProgress(10_000 - step, 10_000);
		const after = pictureProgress(10_000 + step, 10_000) - pictureProgress(10_000, 10_000);
		expect(after / before).toBeCloseTo(1, 2);
	});

	it('copes with a clock that went backwards and an estimate of nothing', () => {
		expect(pictureProgress(-50, 10_000)).toBe(0);
		expect(pictureProgress(1000, 0)).toBeLessThan(1);
	});
});
