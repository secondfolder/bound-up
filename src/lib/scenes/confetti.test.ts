import { describe, expect, it } from 'vitest';
import { confettiGrid, confettiPiece } from './confetti';

describe('confetti', () => {
	it('is as thick on any size of menu: a lane across and a slot down per piece', () => {
		expect(confettiGrid(25, 40)).toEqual({ lanes: 10, slots: 10 });
		expect(confettiGrid(50, 40)).toEqual({ lanes: 20, slots: 10 });
		expect(confettiGrid(0, 0)).toEqual({ lanes: 0, slots: 0 });
	});

	it('works a piece out from its lane and slot alone, inside its lane', () => {
		expect(confettiPiece(3, 7)).toEqual(confettiPiece(3, 7));
		expect(confettiPiece(3, 7)).not.toEqual(confettiPiece(3, 8));
		for (let lane = 0; lane < 20; lane += 1) {
			const { x } = confettiPiece(lane, 0);
			expect(x).toBeGreaterThanOrEqual(lane * 2.5);
			expect(x).toBeLessThan((lane + 1) * 2.5);
		}
	});

	it('is mostly sprinkles, with a star now and then', () => {
		let stars = 0;
		for (let lane = 0; lane < 30; lane += 1) {
			for (let slot = 0; slot < 30; slot += 1) {
				stars += confettiPiece(lane, slot).star ? 1 : 0;
			}
		}
		expect(stars / 900).toBeGreaterThan(0.05);
		expect(stars / 900).toBeLessThan(0.2);
	});
});
