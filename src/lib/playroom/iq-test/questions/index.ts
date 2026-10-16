// biome-ignore-all lint/performance/noBarrelFile: the run builder and the components need the question model as one module; the generators behind it are an implementation detail.

import { anagrams } from './anagrams';
import { centreDistance, pointCredit } from './credit';
import { exposureMemory } from './exposure-memory';
import { centralPoint, visualMemory } from './grids';
import { matrix } from './matrix';
import { digitSpan, workingMemory } from './memory';
import { mentalRotation } from './mental-rotation';
import { letterSeries, numberSeries } from './series';
import { stroop, stroopCount } from './stroop';
import { synonyms } from './synonyms';
import type { AnswerMatch, Generator, Question, QuestionKind } from './types';
import { analogy, oddOneOut, syllogism, vocabulary } from './verbal';
import { wordProblem } from './word-problem';

export { centralCells, centreDistance, hasClearCentre, pointCredit } from './credit';
export { cellName } from './grids';
export { describeCell } from './matrix';
export { CLOCKS, DOM_CLOCK_SCALE, withClock } from './timers';

/**
 * The response to a question whose time ran out with nothing given: it
 * counts as answered, and wrong, rather than as a skip to come back to.
 */
export const TIMED_OUT = '!timed-out';
export type * from './types';

export const GENERATORS: Record<QuestionKind, Generator> = {
	'number-series': numberSeries,
	'letter-series': letterSeries,
	analogy,
	'odd-one-out': oddOneOut,
	vocabulary,
	syllogism,
	matrix,
	stroop,
	'stroop-count': stroopCount,
	'working-memory': workingMemory,
	'digit-span': digitSpan,
	'word-problem': wordProblem,
	synonyms,
	'mental-rotation': mentalRotation,
	'visual-memory': visualMemory,
	anagrams,
	'central-point': centralPoint,
	'exposure-memory': exposureMemory
};

export const QUESTION_KINDS = Object.keys(GENERATORS) as QuestionKind[];

const NON_DIGIT = /\D/g;

/**
 * How much a response is worth, from 0 to 1. An empty response is worth
 * nothing.
 *
 * - A choice or a typed answer is right or wrong.
 * - A tick-all is one point per right pick and one off per wrong one, over
 *   the number right, never below 0: ticking everything is worth nothing,
 *   so guessing does not pay.
 * - A point is worth 1 at the centre's cell, falling off with how much
 *   further it is from the centre (see `pointCredit`).
 */
export function credit(question: Question, response: string | null): number {
	if (response === null || response.trim() === '' || response === TIMED_OUT) {
		return 0;
	}
	switch (question.format) {
		case 'choice':
			return response === question.answer ? 1 : 0;
		case 'text':
			return matches(question.match, question.answer, response) ? 1 : 0;
		case 'multi': {
			const picked = new Set(picksOf(response));
			const right = question.answers.filter((id) => picked.has(id)).length;
			const wrong = picked.size - right;
			return Math.max(0, (right - wrong) / question.answers.length);
		}
		case 'point':
			return pointCredit(question.grid, question.points, Number(response));
		default:
			return 0;
	}
}

/** The ids picked in a tick-all response. */
export function picksOf(response: string | null): string[] {
	return (response ?? '').split(',').filter((id) => id !== '');
}

/** A tick-all response from the ids picked, in a stable order. */
export function pickResponse(ids: Iterable<string>): string {
	return [...new Set(ids)].sort().join(',');
}

/** A wholly right answer, for the "Correct answer" testing aid. */
export function rightAnswer(question: Question): string {
	return question.format === 'multi' ? pickResponse(question.answers) : question.answer;
}

/**
 * An answer that is definitely wrong, for the "Incorrect answer" testing aid.
 *
 * Never empty: an empty answer counts as a skip, which is a different thing
 * to test. For a choice it is another choice; for a typed answer it is one
 * that fails that answer's own comparison — a different number, an extra
 * digit, or a word that is not one of the words to recall.
 */
export function wrongAnswer(question: Question): string {
	if (question.format === 'choice') {
		return question.choices.find((choice) => choice.id !== question.answer)?.id ?? 'none';
	}
	if (question.format === 'multi') {
		// Every wrong one: at least as many wrong as there are right, so nothing.
		return pickResponse(
			question.choices.map((choice) => choice.id).filter((id) => !question.answers.includes(id))
		);
	}
	if (question.format === 'point') {
		// The cell furthest from the centre: a corner, worth nothing.
		const cells = Array.from({ length: question.grid.columns * question.grid.rows }, (_, i) => i);
		const far = (cell: number) => centreDistance(question.grid, question.points, cell);
		return String(cells.reduce((worst, cell) => (far(cell) > far(worst) ? cell : worst), 0));
	}
	switch (question.match) {
		case 'number':
			return String(Number(question.answer) + 1);
		case 'digits':
			return `${question.answer}0`;
		case 'words':
			return 'nothing';
		case 'text':
			return `${question.answer}x`;
		default:
			return 'wrong';
	}
}

/** Exported for the interference sum, which is checked the same way as a numeric answer. */
export function matches(match: AnswerMatch, expected: string, response: string): boolean {
	switch (match) {
		case 'number': {
			const value = Number(response.trim().replaceAll(',', ''));
			return Number.isFinite(value) && value === Number(expected);
		}
		case 'digits':
			return response.replaceAll(NON_DIGIT, '') === expected;
		case 'words': {
			const given = new Set(wordsOf(response));
			return wordsOf(expected).every((word) => given.has(word));
		}
		case 'text':
			return response.trim().toLowerCase() === expected.trim().toLowerCase();
		default:
			return false;
	}
}

const WORD_SEPARATOR = /[^\p{L}\p{N}-]+/u;

function wordsOf(text: string): string[] {
	return text
		.toLowerCase()
		.split(WORD_SEPARATOR)
		.filter((word) => word.length > 0);
}
