import type { Rng } from '../random';
import { textChoices } from './choices';
import type { Difficulty, Generator } from './types';

/** How many terms a series shows before the blank. */
const SHOWN_TERMS = 5;

type Rule = (rng: Rng) => (index: number) => number;

/**
 * Number-series rules, easiest first. A difficulty picks from its own tier,
 * so a level-5 question is never a lucky +2.
 */
const NUMBER_RULES: Record<Difficulty, readonly Rule[]> = {
	1: [
		(rng) => {
			const start = rng.int(1, 9);
			const step = rng.int(2, 5);
			return (i) => start + step * i;
		}
	],
	2: [
		(rng) => {
			const start = rng.int(20, 60);
			const step = rng.int(3, 9);
			return (i) => start - step * i;
		},
		(rng) => {
			const start = rng.int(1, 4);
			return (i) => start * 2 ** i;
		}
	],
	3: [
		(rng) => {
			const start = rng.int(1, 3);
			return (i) => start * 3 ** i;
		},
		(rng) => {
			const start = rng.int(1, 10);
			const a = rng.int(2, 6);
			const b = rng.int(7, 12);
			// Alternating steps: +a, +b, +a, +b…
			return (i) => start + Math.floor((i + 1) / 2) * a + Math.floor(i / 2) * b;
		}
	],
	4: [
		(rng) => {
			const start = rng.int(1, 10);
			const first = rng.int(1, 3);
			// Steps that grow by one each time: the triangular-number trap.
			return (i) => start + first * i + (i * (i - 1)) / 2;
		},
		(rng) => {
			const offset = rng.int(0, 3);
			return (i) => (i + 1 + offset) ** 2;
		}
	],
	5: [
		(rng) => {
			const a = rng.int(1, 4);
			const b = rng.int(2, 6);
			const terms = [a, b];
			for (let i = 2; i < SHOWN_TERMS + 1; i += 1) {
				terms.push((terms[i - 1] ?? 0) + (terms[i - 2] ?? 0));
			}
			return (i) => terms[i] ?? 0;
		},
		(rng) => {
			const start = rng.int(2, 5);
			const add = rng.int(1, 3);
			// Double, then add: 3, 7, 15, 31…
			return (i) => {
				let value = start;
				for (let step = 0; step < i; step += 1) {
					value = value * 2 + add;
				}
				return value;
			};
		},
		(rng) => {
			const offset = rng.int(-1, 2);
			return (i) => (i + 1) ** 3 + offset;
		}
	]
};

export const numberSeries: Generator = (rng, difficulty, _context, id) => {
	const term = rng.pick(NUMBER_RULES[difficulty])(rng);
	const items = Array.from({ length: SHOWN_TERMS }, (_, i) => String(term(i)));
	const answer = term(SHOWN_TERMS);
	const prompt = 'What number comes next?';
	const display = { type: 'sequence' as const, items: [...items, '?'] };
	// Typed at the top end: four options let a guess score one time in four.
	if (difficulty >= 3) {
		return {
			id,
			kind: 'number-series',
			difficulty,
			prompt,
			display,
			format: 'text',
			answer: String(answer),
			match: 'number',
			inputMode: 'numeric'
		};
	}
	const last = term(SHOWN_TERMS - 1);
	const step = answer - last;
	const distractors = [answer + 1, answer - 1, last + step * 2, answer + step, answer - 2].map(
		String
	);
	return {
		id,
		kind: 'number-series',
		difficulty,
		prompt,
		display,
		format: 'choice',
		...textChoices(rng, String(answer), rng.shuffle(distractors).slice(0, 4))
	};
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function letterAt(index: number): string {
	return ALPHABET[((index % 26) + 26) % 26] ?? 'A';
}

export const letterSeries: Generator = (rng, difficulty, _context, id) => {
	const start = rng.int(0, 10);
	const offsets: number[] = [];
	if (difficulty <= 2) {
		const step = difficulty === 1 ? rng.int(1, 2) : rng.int(2, 4);
		for (let i = 0; i <= SHOWN_TERMS; i += 1) {
			offsets.push(step * i);
		}
	} else if (difficulty === 3) {
		// Alternating steps.
		const a = rng.int(1, 2);
		const b = rng.int(3, 4);
		let at = 0;
		for (let i = 0; i <= SHOWN_TERMS; i += 1) {
			offsets.push(at);
			at += i % 2 === 0 ? a : b;
		}
	} else {
		// Growing steps, and at 5 running backwards from the end of the alphabet.
		let at = difficulty === 5 ? 25 - start : 0;
		const direction = difficulty === 5 ? -1 : 1;
		for (let i = 0; i <= SHOWN_TERMS; i += 1) {
			offsets.push(at);
			at += direction * (i + 1);
		}
	}
	const letters = offsets.map((offset) => letterAt(start + offset));
	const answer = letters[SHOWN_TERMS] ?? 'A';
	const answerIndex = ALPHABET.indexOf(answer);
	const distractors = [1, -1, 2, -2, 3].map((delta) => letterAt(answerIndex + delta));
	return {
		id,
		kind: 'letter-series',
		difficulty,
		prompt: 'Which letter comes next?',
		display: { type: 'sequence', items: [...letters.slice(0, SHOWN_TERMS), '?'] },
		format: 'choice',
		...textChoices(rng, answer, rng.shuffle(distractors).slice(0, 4))
	};
};
