import { describe, expect, it } from 'vitest';
import { bradleyTerry, type Vote } from './leaderboard';

function votes(a: string, b: string, aWins: number, bWins: number, ties = 0): Vote[] {
	return [
		...Array.from({ length: aWins }, () => ({ a, b, winner: 'a' as const })),
		...Array.from({ length: bWins }, () => ({ a, b, winner: 'b' as const })),
		...Array.from({ length: ties }, () => ({ a, b, winner: 'tie' as const }))
	];
}

describe('bradleyTerry', () => {
	it('ranks the version that wins more first, with its record', () => {
		const [first, second] = bradleyTerry(votes('v2', 'v1', 8, 2));
		expect(first).toMatchObject({ label: 'v2', wins: 8, losses: 2, ties: 0 });
		expect(second?.label).toBe('v1');
		// Two versions: the strengths' ratio is the win ratio.
		expect((first?.strength ?? 0) / (second?.strength ?? 1)).toBeCloseTo(4, 3);
	});

	it('treats a tie as half a win each', () => {
		const [first, second] = bradleyTerry(votes('a', 'b', 0, 0, 6));
		expect(first?.strength).toBeCloseTo(second?.strength ?? 0, 6);
	});

	it('ranks across versions that never met directly', () => {
		const standings = bradleyTerry([...votes('v3', 'v2', 7, 3), ...votes('v2', 'v1', 7, 3)]);
		expect(standings.map((standing) => standing.label)).toEqual(['v3', 'v2', 'v1']);
	});
});
