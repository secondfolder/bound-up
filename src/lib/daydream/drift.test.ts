import { describe, expect, it } from 'vitest';
import { DRIFT_GAP, driftOffer } from './drift';

const passages = (drifted: number[], count = 12) =>
	Array.from({ length: count }, (_, at) => ({
		id: `p${at}`,
		drifted: drifted.includes(at) ? 'moved on' : null
	}));

describe('driftOffer', () => {
	it('offers under the newest passage that said the story moved on', () => {
		expect(driftOffer(passages([2, 4]), new Set())).toBe('p4');
		expect(driftOffer(passages([]), new Set())).toBeNull();
	});

	it('offers nothing once that offer is answered', () => {
		expect(driftOffer(passages([4]), new Set(['p4']))).toBeNull();
	});

	it('waits a few passages past an answered offer before offering again', () => {
		expect(driftOffer(passages([2, 2 + DRIFT_GAP - 1]), new Set(['p2']))).toBeNull();
		expect(driftOffer(passages([2, 2 + DRIFT_GAP]), new Set(['p2']))).toBe(`p${2 + DRIFT_GAP}`);
	});
});
