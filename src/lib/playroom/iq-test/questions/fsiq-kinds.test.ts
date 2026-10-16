import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import {
	centralCells,
	credit,
	type Difficulty,
	GENERATORS,
	hasClearCentre,
	type MultiQuestion,
	type PointQuestion,
	pickResponse,
	pointCredit,
	type Question,
	type QuestionKind,
	rightAnswer,
	wrongAnswer
} from '.';
import { ANAGRAM_NOT_WORDS, ANAGRAM_WORDS } from './anagrams';
import { mirror, turns } from './mental-rotation';
import { SYNONYM_ENTRIES } from './synonyms';

/** The kinds after openpsychometrics' Full Scale IQ Test. */

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 104_729 + 3);

function each<Q extends Question>(kind: QuestionKind, check: (question: Q) => void) {
	for (const difficulty of DIFFICULTIES) {
		for (const seed of SEEDS) {
			check(GENERATORS[kind](createRng(seed), difficulty, { vibe: null }, 'q') as Q);
		}
	}
}

const QUOTED: RegExp = /“(?<word>.+)”/;

const sortedLetters = (text: string) => [...text.toLowerCase()].sort().join('');
const keyOf = (cells: readonly (readonly [number, number])[]) => JSON.stringify(cells);

describe('credit for a tick-all question', () => {
	const question = GENERATORS.synonyms(createRng(1), 3, { vibe: null }, 'q') as MultiQuestion;
	const wrongs = question.choices.map((c) => c.id).filter((id) => !question.answers.includes(id));

	it('is whole for every right one and nothing else', () => {
		expect(credit(question, pickResponse(question.answers))).toBe(1);
	});

	it('is a share for some, less for each wrong one, and never below nothing', () => {
		const [first, second] = question.answers;
		const n = question.answers.length;
		expect(credit(question, pickResponse([first ?? '']))).toBeCloseTo(1 / n);
		expect(
			credit(question, pickResponse([first ?? '', second ?? '', wrongs[0] ?? '']))
		).toBeCloseTo(1 / n);
		expect(credit(question, pickResponse(wrongs))).toBe(0);
		// Ticking everything is worth nothing: as many wrong as right, or more.
		expect(credit(question, pickResponse(question.choices.map((c) => c.id)))).toBe(0);
	});
});

describe('credit for a central point', () => {
	const grid = { columns: 5, rows: 5 };

	it('is whole at the centre of the points, less near it, nothing far off', () => {
		// Corners of the board: the middle is best.
		const points = [0, 4, 20, 24];
		expect(centralCells(grid, points)).toEqual([12]);
		expect(pointCredit(grid, points, 12)).toBe(1);
		const near = pointCredit(grid, points, 11);
		expect(near).toBeGreaterThan(0);
		expect(near).toBeLessThan(1);
		expect(pointCredit(grid, [0, 1, 5, 6], 24)).toBe(0);
		expect(pointCredit(grid, points, 99)).toBe(0);
	});

	it('is the average position, which a board can put between squares', () => {
		// Two pairs at opposite corners: the centre is on the edge between
		// row 2's second and third squares, and both are equally right.
		const points = [0, 1, 12, 13];
		expect(centralCells(grid, points)).toEqual([6, 7]);
		expect(hasClearCentre(grid, points)).toBe(false);
		// A centre a fifth of a square from an edge is too close to call by eye.
		expect(hasClearCentre(grid, [0, 1, 2, 3, 13])).toBe(false);
		expect(hasClearCentre(grid, [0, 1, 12])).toBe(true);
	});
});

describe('the new kinds', () => {
	it('have answers worth everything and wrong answers worth nothing', () => {
		for (const kind of [
			'synonyms',
			'mental-rotation',
			'visual-memory',
			'anagrams',
			'central-point',
			'exposure-memory'
		] as const) {
			each(kind, (question) => {
				expect(credit(question, rightAnswer(question))).toBe(1);
				expect(credit(question, wrongAnswer(question))).toBe(0);
			});
		}
	});

	it('synonyms: offers only the entry’s synonyms as right, and its made-up words are not among them', () => {
		each<MultiQuestion>('synonyms', (question) => {
			const match: RegExpExecArray | null = QUOTED.exec(question.prompt);
			const word = match?.groups?.word;
			const entry = SYNONYM_ENTRIES.find((candidate) => candidate.word === word);
			expect(entry).toBeDefined();
			for (const choice of question.choices) {
				expect(question.answers.includes(choice.id)).toBe(
					entry?.synonyms.includes(choice.label) ?? false
				);
			}
			expect(question.answers.length).toBeGreaterThanOrEqual(3);
		});
		for (const entry of SYNONYM_ENTRIES) {
			for (const fake of entry.madeUp) {
				expect(entry.synonyms).not.toContain(fake);
			}
		}
	});

	it('anagrams: the right sets are scrambled words, never left in order, and no other set is a word', () => {
		const words = Object.values(ANAGRAM_WORDS).flat();
		const wordKeys = new Set(words.map(sortedLetters));
		for (const set of Object.values(ANAGRAM_NOT_WORDS).flat()) {
			expect(wordKeys.has(sortedLetters(set))).toBe(false);
			// See the generator: S and E-with-D let plurals and past tenses through.
			expect(set).not.toMatch(/S/);
			expect(/E/.test(set) && /D/.test(set)).toBe(false);
		}
		each<MultiQuestion>('anagrams', (question) => {
			for (const choice of question.choices) {
				const isWord = wordKeys.has(sortedLetters(choice.label));
				expect(question.answers.includes(choice.id)).toBe(isWord);
				expect(words).not.toContain(choice.label.toLowerCase());
			}
		});
	});

	it('mental rotation: every right shape is a turn of the one shown, and every wrong one is not', () => {
		each<MultiQuestion>('mental-rotation', (question) => {
			if (question.display.type !== 'polyomino') {
				throw new Error('no shape shown');
			}
			const shown = question.display.cells;
			const turned = new Set(turns(shown).map(keyOf));
			const mirrored = new Set(turns(mirror(shown)).map(keyOf));
			// Asymmetric: a mirror image is never also a turn.
			expect([...mirrored].some((key) => turned.has(key))).toBe(false);
			for (const choice of question.choices) {
				const key = keyOf(choice.polyomino ?? []);
				expect(question.answers.includes(choice.id)).toBe(turned.has(key));
				expect(choice.label).toMatch(/^Shape [A-H]$/);
			}
			// From difficulty 3 the shape as shown is never itself an answer.
			const shownKey = keyOf(shown);
			const offered = question.choices.some((c) => keyOf(c.polyomino ?? []) === shownKey);
			expect(offered && question.difficulty >= 3).toBe(false);
		});
	});

	it('visual memory: the cells to shade are the ones shown, more as it climbs', () => {
		each<MultiQuestion>('visual-memory', (question) => {
			const shaded = question.memorise?.grid?.shaded ?? [];
			expect(question.answers).toEqual(shaded.map(String));
			expect(shaded).toHaveLength(question.difficulty + 3);
			expect(question.choices).toHaveLength(30);
		});
	});

	it('central point: its answer is the only best cell, on a board that grows', () => {
		each<PointQuestion>('central-point', (question) => {
			expect(centralCells(question.grid, question.points)).toEqual([Number(question.answer)]);
			expect(hasClearCentre(question.grid, question.points)).toBe(true);
			expect(question.points).toHaveLength(question.difficulty + 2);
			expect(question.grid.columns).toBe(4 + question.difficulty);
		});
	});

	it('exposure memory: right answers were shown, wrong ones were not, one at a time', () => {
		each<MultiQuestion>('exposure-memory', (question) => {
			const shown = question.memorise?.items ?? [];
			expect(question.memorise?.intervalMs).toBeGreaterThan(0);
			expect(question.choices).toHaveLength(8);
			expect(question.answers.length).toBeGreaterThanOrEqual(3);
			expect(question.answers.length).toBeLessThanOrEqual(5);
			for (const choice of question.choices) {
				expect(question.answers.includes(choice.id)).toBe(shown.includes(choice.icon ?? ''));
			}
		});
	});
});
