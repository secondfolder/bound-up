import { describe, expect, it, it as test } from 'vitest';
import { isCorrect } from '$lib/testing/iq-test';
import { createRng } from '../random';
import { VIBES, type Vibe } from '../settings';
import {
	type ChoiceQuestion,
	type Difficulty,
	GENERATORS,
	matches,
	QUESTION_KINDS,
	type Question,
	rightAnswer,
	wrongAnswer
} from '.';

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];
const CONTEXTS: (Vibe | null)[] = [null, ...VIBES];
/** Enough seeds that a template with a bad corner shows up, few enough to stay fast. */
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);

function generate(
	kind: (typeof QUESTION_KINDS)[number],
	difficulty: Difficulty,
	vibe: Vibe | null,
	seed: number
) {
	return GENERATORS[kind](createRng(seed), difficulty, { vibe }, 'q');
}

function choiceKey(choice: ChoiceQuestion['choices'][number]): string {
	return JSON.stringify(choice.cell ?? choice.polyomino ?? choice.label.toLowerCase());
}

/**
 * What is wrong with a question's shape, as a list, so one `expect` covers
 * both formats rather than one per branch.
 */
function shapeProblems(question: Question): string[] {
	const problems: string[] = [];
	if (question.format === 'choice') {
		const ids = question.choices.map((choice) => choice.id);
		if (!ids.includes(question.answer)) {
			problems.push('the answer is not one of the choices');
		}
		if (new Set(ids).size !== ids.length) {
			problems.push('two choices share an id');
		}
		// Two identical options would make the question unanswerable.
		const keys = question.choices.map(choiceKey);
		if (new Set(keys).size !== keys.length) {
			problems.push(`two choices are the same: ${keys.join(', ')}`);
		}
		if (question.choices.length < 3) {
			problems.push('fewer than three choices');
		}
	} else if (question.format === 'multi') {
		const ids = question.choices.map((choice) => choice.id);
		if (!question.answers.every((answer) => ids.includes(answer))) {
			problems.push('an answer is not one of the choices');
		}
		if (new Set(ids).size !== ids.length) {
			problems.push('two choices share an id');
		}
		const keys = question.choices.map(choiceKey);
		if (new Set(keys).size !== keys.length) {
			problems.push(`two choices are the same: ${keys.join(', ')}`);
		}
		if (question.answers.length === 0 || question.answers.length === ids.length) {
			problems.push('nothing to tell apart: all right or none');
		}
	} else if (question.format === 'point') {
		const cells = question.grid.columns * question.grid.rows;
		if (!question.points.every((point) => point >= 0 && point < cells)) {
			problems.push('a point off the board');
		}
	} else if (question.match === 'number' && !Number.isInteger(Number(question.answer))) {
		problems.push(`a typed answer that is not a whole number: ${question.answer}`);
	}
	return problems;
}

describe.each(QUESTION_KINDS)('%s', (kind) => {
	test('is answerable at every difficulty and in every vibe', () => {
		for (const difficulty of DIFFICULTIES) {
			for (const vibe of CONTEXTS) {
				for (const seed of SEEDS) {
					const question = generate(kind, difficulty, vibe, seed);
					expect(question.kind).toBe(kind);
					expect(question.difficulty).toBe(difficulty);
					expect(question.prompt.length).toBeGreaterThan(0);
					expect(isCorrect(question, rightAnswer(question))).toBe(true);
					expect(shapeProblems(question)).toEqual([]);
				}
			}
		}
	});

	test('deals the same question for the same seed', () => {
		for (const difficulty of DIFFICULTIES) {
			expect(generate(kind, difficulty, 'bambi', 42)).toEqual(
				generate(kind, difficulty, 'bambi', 42)
			);
		}
	});
});

describe('wrong answers', () => {
	it('are refused, and an empty answer is never right', () => {
		const questions = QUESTION_KINDS.map((kind) => generate(kind, 3, null, 7));
		for (const question of questions) {
			expect(isCorrect(question, '')).toBe(false);
			expect(isCorrect(question, null)).toBe(false);
		}
		const choiceQuestions = questions.filter(
			(question): question is ChoiceQuestion => question.format === 'choice'
		);
		expect(choiceQuestions.length).toBeGreaterThan(0);
		for (const question of choiceQuestions) {
			const wrong = question.choices.find((choice) => choice.id !== question.answer);
			expect(isCorrect(question, wrong?.id ?? 'zz')).toBe(false);
		}
	});
});

describe('wrongAnswer', () => {
	it('is never correct and never empty, for every kind, difficulty and seed', () => {
		for (const kind of QUESTION_KINDS) {
			for (const difficulty of DIFFICULTIES) {
				for (const seed of SEEDS) {
					const question = generate(kind, difficulty, null, seed);
					const wrong = wrongAnswer(question);
					expect(wrong.trim()).not.toBe('');
					expect(isCorrect(question, wrong)).toBe(false);
				}
			}
		}
	});
});

describe('matches', () => {
	it('compares numbers by value', () => {
		expect(matches('number', '12', ' 12 ')).toBe(true);
		expect(matches('number', '12', '12.0')).toBe(true);
		expect(matches('number', '1200', '1,200')).toBe(true);
		expect(matches('number', '12', 'twelve')).toBe(false);
	});

	it('compares digit spans ignoring separators', () => {
		expect(matches('digits', '531', '5 3 1')).toBe(true);
		expect(matches('digits', '531', '5-3-1')).toBe(true);
		expect(matches('digits', '531', '135')).toBe(false);
	});

	it('accepts recalled words in any order and case, and needs all of them', () => {
		expect(matches('words', 'apple river candle', 'Candle, APPLE river')).toBe(true);
		expect(matches('words', 'apple river candle', 'apple river')).toBe(false);
	});
});

describe('difficulty', () => {
	it('gives longer lists to memorise as it climbs', () => {
		const easy = generate('working-memory', 1, null, 3);
		const hard = generate('working-memory', 5, null, 3);
		expect(hard.memorise?.items.length).toBeGreaterThan(easy.memorise?.items.length ?? 0);
		const shortSpan = generate('digit-span', 1, null, 3);
		const longSpan = generate('digit-span', 5, null, 3);
		expect(longSpan.memorise?.items.length).toBeGreaterThan(shortSpan.memorise?.items.length ?? 0);
	});

	it('makes the number series typed rather than chosen at the top end', () => {
		expect(generate('number-series', 1, null, 3).format).toBe('choice');
		expect(generate('number-series', 5, null, 3).format).toBe('text');
	});

	it('puts more Stroop words on screen to count', () => {
		const count = (question: Question) =>
			question.display.type === 'stroop' ? question.display.words.length : 0;
		expect(count(generate('stroop-count', 5, null, 3))).toBeGreaterThan(
			count(generate('stroop-count', 1, null, 3))
		);
	});
});

describe('stroop', () => {
	it('always prints the word in a colour other than the one it names', () => {
		for (const seed of SEEDS) {
			const question = generate('stroop', 2, null, seed);
			if (question.display.type !== 'stroop') {
				throw new Error('Expected a Stroop display');
			}
			for (const { word, ink } of question.display.words) {
				expect(word).not.toBe(ink);
			}
		}
	});
});

describe('stroop answers', () => {
	it('answers "what does it say" with colour blocks, and "what colour is the ink" with words', () => {
		for (const seed of SEEDS) {
			const question = generate('stroop', 4, null, seed) as ChoiceQuestion;
			const says = question.prompt.startsWith('What does this word say');
			// A block of the colour named for "says"; words, with no block, for "ink".
			expect(question.choices.map((choice) => choice.swatch ?? null)).toEqual(
				question.choices.map((choice) => (says ? choice.label : null))
			);
			expect(question.choices.some((choice) => says && choice.ink)).toBe(false);
		}
	});
});

describe('word problems', () => {
	it('never count silly props, in any vibe', () => {
		const props =
			/lipstick|lipgloss|curtsies|drool|condom|scrunchie|hair bows|glitter pens|slaps|begs/i;
		for (const vibe of CONTEXTS) {
			for (const difficulty of DIFFICULTIES) {
				for (const seed of SEEDS) {
					const { prompt } = generate('word-problem', difficulty, vibe, seed);
					expect(prompt).not.toMatch(props);
					expect(prompt).not.toMatch(/undefined|NaN/);
				}
			}
		}
	});
});

describe('theming', () => {
	it('uses neutral words when there is no vibe, and the vibe’s own when there is', () => {
		const neutral = generate('working-memory', 3, null, 11);
		const themed = generate('working-memory', 3, 'bambi', 11);
		expect(neutral.memorise?.items).not.toContain('bimbo');
		expect(
			themed.memorise?.items.some((word) =>
				[
					'pink',
					'giggle',
					'bimbo',
					'lipgloss',
					'bubbles',
					'heels',
					'ponytail',
					'sparkle',
					'dolly',
					'lashes',
					'sleepy',
					'blank',
					'obey',
					'glitter',
					'pout',
					'bounce'
				].includes(word)
			)
		).toBe(true);
	});

	it('writes syllogisms in nonsense words when neutral, so knowledge cannot help', () => {
		const question = generate('syllogism', 3, null, 5);
		if (question.display.type !== 'statements') {
			throw new Error('Expected statements');
		}
		expect(question.display.lines.join(' ')).toMatch(
			/blickets|wugs|daxes|zorbs|plimps|feps|toves|grups/
		);
	});
});
