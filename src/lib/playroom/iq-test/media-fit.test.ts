import { describe, expect, it } from 'vitest';
import { fitCount, MOST_FILL_ROWS, pornSpacing, sideColumns, stripRows } from './media-fit';

describe('fitCount', () => {
	it('picks the count whose natural lengths come nearest the space', () => {
		// 400 each, 8 between: three come to 1216.
		expect(fitCount([400, 400, 400, 400], 1250, 8)).toBe(3);
		expect(fitCount([400, 400, 400, 400], 820, 8)).toBe(2);
		// Halfway between one and two goes by ratio, not by pixels.
		expect(fitCount([100, 100], 160, 0)).toBe(2);
		expect(fitCount([100, 100], 130, 0)).toBe(1);
	});

	it('never shows fewer than it must, nor more than it has', () => {
		expect(fitCount([400, 400, 400], 100, 8, 2)).toBe(2);
		expect(fitCount([400, 400], 5000, 8)).toBe(2);
		expect(fitCount([], 500, 8)).toBe(0);
		expect(fitCount([400, 400], 0, 8)).toBe(1);
	});
});

describe('sideColumns', () => {
	const gap = 8;

	it('reaches the edge with columns no wider than the widest', () => {
		for (const room of [200, 320, 500, 900, 1400]) {
			const { count, width } = sideColumns(room, gap, 320);
			expect(width).toBeLessThanOrEqual(320);
			expect(count * width + (count - 1) * gap).toBeGreaterThanOrEqual(room - 0.001);
		}
	});

	it('fits exactly, never running a column off the edge', () => {
		for (const room of [100, 200, 333, 650, 1000, 1999]) {
			const { count, width } = sideColumns(room, gap, 320);
			expect(count * width + (count - 1) * gap).toBeCloseTo(room, 6);
			// Never narrower than about half the widest, once there are two.
			expect(count === 1 || width > 320 / 2 - gap, `${room}px`).toBe(true);
		}
	});

	it('adds a column as the room passes another whole one', () => {
		expect(sideColumns(320, gap, 320).count).toBe(1);
		expect(sideColumns(330, gap, 320).count).toBe(2);
	});
});

describe('pornSpacing', () => {
	it('packs level 4 and gives level 3 more room around fewer, bigger pieces', () => {
		const three = pornSpacing(3);
		const four = pornSpacing(4);
		expect(four).toEqual({ gap: 0.5, widest: 20, strip: 9 });
		expect(three.gap).toBeGreaterThan(four.gap);
		expect(three.widest).toBeGreaterThan(four.widest);
		expect(three.strip).toBeGreaterThan(four.strip);
	});
});

describe('stripRows', () => {
	it('fills nothing too short for even a short strip, unless told to', () => {
		expect(stripRows(50, 8, 144)).toBe(0);
		expect(stripRows(50, 8, 144, 1)).toBe(1);
	});

	it('stacks as many strips of about the height as fit', () => {
		expect(stripRows(100, 8, 144)).toBe(1);
		expect(stripRows(144 * 2 + 8, 8, 144)).toBe(2);
		expect(stripRows(144 * 3 + 16, 8, 144)).toBe(3);
	});

	it('stops somewhere, however tall the space', () => {
		expect(stripRows(100_000, 8, 144)).toBe(MOST_FILL_ROWS);
	});
});
