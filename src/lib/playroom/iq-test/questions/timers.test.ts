import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import {
	CLOCKS,
	credit,
	type Difficulty,
	GENERATORS,
	QUESTION_KINDS,
	TIMED_OUT,
	withClock
} from '.';

const MEMORY = ['working-memory', 'digit-span', 'visual-memory', 'exposure-memory'];

describe('the clocks', () => {
	it('time every question but the memory ones, whose memorising is already the clock', () => {
		for (const kind of QUESTION_KINDS) {
			const question = withClock(GENERATORS[kind](createRng(1), 3, { vibe: null }, 'q'));
			const clocked = question.timed !== undefined || question.limit !== undefined;
			expect(clocked, kind).toBe(!MEMORY.includes(kind));
			// The memory ones are left with their memorising time instead.
			expect(clocked || question.memorise !== undefined, kind).toBe(true);
		}
	});

	it('hide what is looked back at, and put a deadline on what is read once', () => {
		const clock = (kind: (typeof QUESTION_KINDS)[number]) => CLOCKS[kind]?.type;
		for (const kind of ['number-series', 'syllogism', 'matrix', 'stroop', 'mental-rotation']) {
			expect(clock(kind as never), kind).toBe('shown');
		}
		for (const kind of ['odd-one-out', 'analogy', 'vocabulary', 'synonyms', 'anagrams']) {
			expect(clock(kind as never), kind).toBe('limit');
		}
		// A word problem is all prompt, so the prompt is what goes.
		expect(
			withClock(GENERATORS['word-problem'](createRng(1), 2, { vibe: null }, 'q')).timed?.prompt
		).toBe(true);
	});

	it('run shorter as the difficulty climbs, and never to nothing', () => {
		for (const kind of QUESTION_KINDS) {
			const seconds = ([1, 3, 5] as Difficulty[]).map((difficulty) => {
				const question = withClock(GENERATORS[kind](createRng(9), difficulty, { vibe: null }, 'q'));
				return question.timed?.seconds ?? question.limit?.seconds ?? null;
			});
			if (seconds[0] === null) {
				continue;
			}
			expect(
				seconds.every((value) => (value ?? 0) >= 2),
				kind
			).toBe(true);
			// Stroop count's time follows its length, which grows: the others shrink.
			const shrinks = (seconds[2] ?? 0) <= (seconds[0] ?? 0);
			expect(shrinks || kind === 'stroop-count', kind).toBe(true);
		}
	});

	it('make running out worth nothing, in every format', () => {
		for (const kind of QUESTION_KINDS) {
			expect(credit(GENERATORS[kind](createRng(2), 3, { vibe: null }, 'q'), TIMED_OUT), kind).toBe(
				0
			);
		}
	});
});
