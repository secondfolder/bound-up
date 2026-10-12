import type { Rng } from '../random';
import type { Difficulty, Generator, Interference } from './types';
import { MEMORY_WORDS } from './words';

/**
 * Working-memory questions. These carry most of the test's weight for anyone
 * being distracted, because something has to be held in mind across a gap,
 * and the gap is where the distracting levels do their flashing.
 */

/** Remember some words, do a sum, then type the words back. */
export const workingMemory: Generator = (rng, difficulty, { vibe }, id) => {
	const count = difficulty + 3;
	const words = rng.sample(MEMORY_WORDS[vibe ?? 'neutral'], count);
	return {
		id,
		kind: 'working-memory',
		difficulty,
		prompt: 'Type the words you were asked to remember, in any order.',
		display: { type: 'none' },
		memorise: {
			prompt: 'Remember these words. You will be asked for them after a short task.',
			items: words,
			// Longer lists get more time, but less per word as difficulty climbs.
			seconds: Math.round(count * (2 - difficulty * 0.2))
		},
		interference: interferenceSum(rng, difficulty),
		format: 'text',
		answer: words.join(' '),
		match: 'words',
		inputMode: 'text'
	};
};

/** Read some digits, then type them in reverse. */
export const digitSpan: Generator = (rng, difficulty, _context, id) => {
	const length = difficulty + 2;
	const digits = Array.from({ length }, () => String(rng.int(0, 9)));
	return {
		id,
		kind: 'digit-span',
		difficulty,
		prompt: 'Type the digits you saw, in reverse order.',
		display: { type: 'none' },
		memorise: {
			prompt: 'Remember these digits, in order.',
			items: digits,
			seconds: Math.max(3, Math.round(length * 0.9))
		},
		format: 'text',
		answer: [...digits].reverse().join(''),
		match: 'digits',
		inputMode: 'numeric'
	};
};

function interferenceSum(rng: Rng, difficulty: Difficulty): Interference {
	if (difficulty <= 2) {
		const a = rng.int(2, 9);
		const b = rng.int(2, 9);
		return { prompt: `What is ${a} + ${b}?`, answer: String(a + b) };
	}
	if (difficulty <= 4) {
		const a = rng.int(12, 49);
		const b = rng.int(12, 49);
		return { prompt: `What is ${a} + ${b}?`, answer: String(a + b) };
	}
	const a = rng.int(12, 29);
	const b = rng.int(3, 8);
	return { prompt: `What is ${a} × ${b}?`, answer: String(a * b) };
}
