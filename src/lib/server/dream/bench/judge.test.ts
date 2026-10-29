import { describe, expect, it } from 'vitest';
import { BENCH_BRIEFS } from './briefs';
import { combine, evenMaterial, MAX_JUDGED_CHARS, pairRuns, parseVerdict } from './judge';
import type { BenchRun } from './run';

const [brief] = BENCH_BRIEFS;

function run(id: string, passages: string[], error?: string): BenchRun {
	if (!brief) {
		throw new Error('the bench has no briefs');
	}
	return {
		brief: { ...brief, id },
		label: 'test',
		model: 'stub',
		seed: 's',
		nudges: [],
		reading: {
			musts: [],
			research: { needed: false, text: '' },
			spread: { n: 1, reason: '' },
			directions: [],
			pick: { by: 'code', reason: '' },
			ask: null,
			rest: []
		},
		picked: null,
		build: null,
		passages,
		steps: [],
		checks: [],
		fingerprint: null,
		cost: 0,
		...(error ? { error } : {})
	};
}

describe('the pairwise judge', () => {
	it('counts a verdict only when both orders agree', () => {
		expect(combine('first', 'second')).toBe('a');
		expect(combine('second', 'first')).toBe('b');
		expect(combine('tie', 'tie')).toBe('tie');
		// Preferring whichever came first is position bias, not a verdict.
		expect(combine('first', 'first')).toBe('inconsistent');
		expect(combine(null, 'second')).toBe('inconsistent');
	});

	it('cuts both runs to the same length, at most the cap', () => {
		const [first, second] = evenMaterial(run('x', ['short']), run('x', ['a much longer passage']));
		expect(first.length).toBe(second.length);
		const [long] = evenMaterial(run('x', ['y'.repeat(9000)]), run('x', ['z'.repeat(9000)]));
		expect(long.length).toBe(MAX_JUDGED_CHARS);
	});

	it('reads a verdict leniently, and nothing else as one', () => {
		expect(parseVerdict('<verdict> Second </verdict>\n<reason>Tighter.</reason>')).toEqual({
			verdict: 'second',
			reason: 'Tighter.'
		});
		expect(parseVerdict('I prefer the second.')).toBeNull();
	});

	it('pairs runs of the same brief in order, skipping failed runs', () => {
		const pairs = pairRuns(
			[run('a', ['1']), run('a', ['2']), run('b', ['3'])],
			[run('a', ['4']), run('a', ['5'], 'broke'), run('c', ['6'])]
		);
		expect(pairs.map((pair) => [pair.a.passages[0], pair.b.passages[0]])).toEqual([['1', '4']]);
	});
});
