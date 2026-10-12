import type { Difficulty, Question, QuestionKind } from './types';

/**
 * Every question a sub is asked runs against a clock — part of the rigging,
 * so a dom's are untimed (`run.ts` only calls this for a sub). Which clock
 * depends on what hiding the question does:
 *
 * - **Shown for a while** (`timed`): where looking back at the question is
 *   how it gets answered — a series, statements, a matrix, a shape to turn,
 *   colour words, a word problem's numbers, the points on a board — the
 *   question is hidden after a time, and has to be answered from memory.
 *   The answers stay, and there is no deadline for them.
 * - **Answered in time** (`limit`): where the question is read once and
 *   looking back gains nothing — an odd one out, an analogy, a word to define,
 *   letters to unscramble — hiding it would change nothing, so the deadline
 *   is on answering, and running out fails it.
 *
 * The memory questions are left as they are: their memorising time is
 * already the clock, and the question itself.
 *
 * Shorter as the difficulty climbs, in every case.
 */
type Clock =
	| {
			type: 'shown';
			seconds: (difficulty: Difficulty, question: Question) => number;
			prompt?: true;
	  }
	| { type: 'limit'; seconds: (difficulty: Difficulty) => number };

const shown = (base: number, least: number, prompt?: true): Clock => ({
	type: 'shown',
	seconds: (difficulty) => Math.max(least, base - difficulty),
	...(prompt ? { prompt } : {})
});
const limit = (base: number, step: number, least: number): Clock => ({
	type: 'limit',
	seconds: (difficulty) => Math.max(least, base - step * difficulty)
});

export const CLOCKS: Record<QuestionKind, Clock | null> = {
	'number-series': shown(11, 4),
	'letter-series': shown(11, 4),
	syllogism: shown(14, 6),
	matrix: shown(13, 5),
	// The word at a glance, the ink pulling: 4 seconds down to 2.
	stroop: shown(5, 2),
	// A little under a second a word.
	'stroop-count': {
		type: 'shown',
		seconds: (_, question) =>
			Math.ceil(
				1.5 + (question.display.type === 'stroop' ? question.display.words.length : 4) * 0.75
			)
	},
	'mental-rotation': shown(10, 4),
	'central-point': shown(9, 3),
	// All prompt: the numbers have to be held while the sum is done.
	'word-problem': shown(15, 6, true),
	analogy: limit(24, 2, 10),
	'odd-one-out': limit(24, 2, 10),
	vocabulary: limit(24, 2, 10),
	synonyms: limit(36, 3, 18),
	anagrams: limit(50, 2.5, 35),
	'working-memory': null,
	'digit-span': null,
	'visual-memory': null,
	'exposure-memory': null
};

/** A question with its clock on, as a sub gets it. */
export function withClock(question: Question): Question {
	const clock = CLOCKS[question.kind];
	if (clock === null) {
		return question;
	}
	if (clock.type === 'limit') {
		return { ...question, limit: { seconds: Math.round(clock.seconds(question.difficulty)) } };
	}
	const seconds = Math.round(clock.seconds(question.difficulty, question));
	return { ...question, timed: clock.prompt ? { seconds, prompt: true } : { seconds } };
}
