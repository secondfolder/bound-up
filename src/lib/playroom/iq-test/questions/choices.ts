import type { Rng } from '../random';
import type { Choice } from './types';

const CHOICE_IDS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/**
 * The correct answer and its distractors, shuffled, with ids that say nothing.
 *
 * Ids are positional letters rather than the labels, so the answer cannot be
 * read off the markup, and duplicates among the distractors are dropped —
 * two identical options would make a question unanswerable.
 */
export function shuffledChoices(
	rng: Rng,
	correct: Omit<Choice, 'id'>,
	distractors: readonly Omit<Choice, 'id'>[]
): { choices: Choice[]; answer: string } {
	const seen = new Set([choiceKey(correct)]);
	const unique: Omit<Choice, 'id'>[] = [];
	for (const distractor of distractors) {
		const key = choiceKey(distractor);
		if (!seen.has(key)) {
			seen.add(key);
			unique.push(distractor);
		}
	}
	const options = rng.shuffle([correct, ...unique.slice(0, CHOICE_IDS.length - 1)]);
	const choices = options.map((option, index) => ({
		...option,
		id: CHOICE_IDS[index] ?? `${index}`
	}));
	const answer = choices[options.indexOf(correct)]?.id;
	if (answer === undefined) {
		throw new Error('shuffledChoices lost the correct answer');
	}
	return { choices, answer };
}

function choiceKey(choice: Omit<Choice, 'id'>): string {
	if (choice.cell) {
		return JSON.stringify(choice.cell);
	}
	return choice.polyomino ? JSON.stringify(choice.polyomino) : choice.label.toLowerCase();
}

/** Plain-text choices, which is most of them. */
export function textChoices(
	rng: Rng,
	correct: string,
	distractors: readonly string[]
): { choices: Choice[]; answer: string } {
	return shuffledChoices(
		rng,
		{ label: correct },
		distractors.map((label) => ({ label }))
	);
}

/**
 * The right answers and the wrong ones of a tick-all question, shuffled
 * together, with ids that say nothing (letters, as for a single answer).
 * Duplicates are dropped as `shuffledChoices` drops them.
 */
export function multiChoices(
	rng: Rng,
	rights: readonly Omit<Choice, 'id'>[],
	wrongs: readonly Omit<Choice, 'id'>[]
): { choices: Choice[]; answers: string[] } {
	const seen = new Set<string>();
	const unique = (list: readonly Omit<Choice, 'id'>[]) =>
		list.filter((option) => {
			const key = choiceKey(option);
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
	const right = new Set(unique(rights));
	const options = rng.shuffle([...right, ...unique(wrongs)]);
	const choices = options.map((option, index) => ({
		...option,
		id: String.fromCharCode(97 + index)
	}));
	const answers = choices.filter((_, index) => right.has(options[index] as Omit<Choice, 'id'>));
	return { choices, answers: answers.map((choice) => choice.id) };
}
