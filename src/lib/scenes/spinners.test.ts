import { describe, expect, it } from 'vitest';
import { spinDuration, spinTurns } from './spinners';

describe('a sweep over the clips', () => {
	it('spins a clip further the faster it was, the way it went, within bounds', () => {
		expect(spinTurns(0)).toBe(0);
		// Even a slow sweep shows; a fast one does not spin for ever.
		expect(spinTurns(0.01)).toBe(0.25);
		expect(spinTurns(1)).toBe(1.5);
		expect(spinTurns(20)).toBe(4);
		expect(spinTurns(-1)).toBe(-1.5);
	});

	it('lets a longer spin run on longer', () => {
		expect(spinDuration(4)).toBeGreaterThan(spinDuration(0.25));
		expect(spinDuration(-2)).toBe(spinDuration(2));
	});
});
