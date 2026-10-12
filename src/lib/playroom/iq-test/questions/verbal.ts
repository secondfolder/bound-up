import { textChoices } from './choices';
import type { Generator } from './types';
import {
	CATEGORIES,
	NEAR_CATEGORY,
	NEUTRAL_RELATIONS,
	NEUTRAL_VOCABULARY,
	SYLLOGISM_TERMS,
	VIBE_RELATIONS,
	VIBE_VOCABULARY
} from './words';

export const analogy: Generator = (rng, difficulty, { vibe }, id) => {
	const groups = vibe ? [...NEUTRAL_RELATIONS, VIBE_RELATIONS[vibe]] : NEUTRAL_RELATIONS;
	// A themed run leans on its own relation half the time, so it is noticed.
	const group =
		vibe && rng.chance(0.5) ? VIBE_RELATIONS[vibe] : rng.pick(groups.slice(0, difficulty + 1));
	const [first, second] = rng.sample(group.pairs, 2);
	if (!(first && second)) {
		throw new Error(`Relation "${group.relation}" needs at least two pairs`);
	}
	// Distractors: the other half of the same pair (the reverse-relation trap)
	// at the top end, and words from other pairs in the same group, which share
	// the relation's flavour and so cannot be ruled out by topic alone.
	const sameGroup = group.pairs
		.filter((pair) => pair !== first && pair !== second)
		.map(([, b]) => b);
	const distractors = rng.shuffle(sameGroup).slice(0, 3);
	if (difficulty >= 4) {
		distractors.unshift(second[0]);
	}
	return {
		id,
		kind: 'analogy',
		difficulty,
		prompt: `${capitalise(first[0])} is to ${first[1]} as ${second[0]} is to…`,
		display: { type: 'none' },
		format: 'choice',
		...textChoices(rng, second[1], distractors.slice(0, 4))
	};
};

export const oddOneOut: Generator = (rng, difficulty, _context, id) => {
	if ((difficulty === 4 || difficulty === 5) && rng.chance(0.5)) {
		return numericOddOneOut(rng, difficulty, id);
	}
	const category = rng.pick(CATEGORIES);
	const nearName = NEAR_CATEGORY[category.name];
	// Easy: the odd one is from anywhere. Hard: from the neighbouring category.
	const pool =
		difficulty >= 3 && nearName
			? (CATEGORIES.find((other) => other.name === nearName)?.items ?? [])
			: CATEGORIES.filter((other) => other !== category).flatMap((other) => other.items);
	const odd = rng.pick(pool);
	const members = rng.sample(category.items, 3);
	return {
		id,
		kind: 'odd-one-out',
		difficulty,
		prompt: 'Which one does not belong with the others?',
		display: { type: 'none' },
		format: 'choice',
		...textChoices(rng, odd, members)
	};
};

const PRIMES = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53] as const;
const ODD_COMPOSITES = [15, 21, 25, 27, 33, 35, 39, 45, 49, 51] as const;

function numericOddOneOut(rng: Parameters<Generator>[0], difficulty: 4 | 5, id: string) {
	// Four odd numbers, three of them prime: parity cannot give it away.
	const primesAreMembers = rng.chance(0.5);
	const members = rng.sample(primesAreMembers ? PRIMES : ODD_COMPOSITES, 3).map(String);
	const odd = String(rng.pick(primesAreMembers ? ODD_COMPOSITES : PRIMES));
	return {
		id,
		kind: 'odd-one-out' as const,
		difficulty,
		prompt: 'Which number does not belong with the others?',
		display: { type: 'none' as const },
		format: 'choice' as const,
		...textChoices(rng, odd, members)
	};
}

export const vocabulary: Generator = (rng, difficulty, { vibe }, id) => {
	const tier = NEUTRAL_VOCABULARY[difficulty - 1] ?? [];
	const entry = vibe && rng.chance(0.5) ? rng.pick(VIBE_VOCABULARY[vibe]) : rng.pick(tier);
	const [word, synonym, ...distractors] = entry;
	return {
		id,
		kind: 'vocabulary',
		difficulty,
		prompt: `Which word is closest in meaning to “${word}”?`,
		display: { type: 'none' },
		format: 'choice',
		...textChoices(rng, synonym, distractors)
	};
};

type Conclusion = 'True' | 'False' | 'Cannot tell';

/**
 * Syllogism forms, from the ones everybody gets to the ones that catch people
 * who answer from what sounds right. `{a}`, `{b}`, `{c}` are filled with terms.
 */
const SYLLOGISMS: readonly {
	minDifficulty: number;
	premises: [string, string];
	conclusion: string;
	answer: Conclusion;
}[] = [
	{
		minDifficulty: 1,
		premises: ['All {a} are {b}.', 'All {b} are {c}.'],
		conclusion: 'All {a} are {c}.',
		answer: 'True'
	},
	{
		minDifficulty: 1,
		premises: ['All {a} are {b}.', 'No {b} are {c}.'],
		conclusion: 'No {a} are {c}.',
		answer: 'True'
	},
	{
		minDifficulty: 2,
		premises: ['All {a} are {b}.', 'No {b} are {c}.'],
		conclusion: 'Some {a} are {c}.',
		answer: 'False'
	},
	{
		minDifficulty: 3,
		premises: ['All {a} are {b}.', 'All {b} are {c}.'],
		conclusion: 'All {c} are {a}.',
		answer: 'Cannot tell'
	},
	{
		minDifficulty: 3,
		premises: ['Some {a} are {b}.', 'All {b} are {c}.'],
		conclusion: 'Some {a} are {c}.',
		answer: 'True'
	},
	{
		minDifficulty: 4,
		premises: ['Some {a} are {b}.', 'Some {b} are {c}.'],
		conclusion: 'Some {a} are {c}.',
		answer: 'Cannot tell'
	},
	{
		minDifficulty: 4,
		premises: ['All {a} are {b}.', 'Some {c} are not {b}.'],
		conclusion: 'Some {c} are not {a}.',
		answer: 'True'
	},
	{
		minDifficulty: 5,
		premises: ['No {a} are {b}.', 'Some {c} are {b}.'],
		conclusion: 'Some {c} are not {a}.',
		answer: 'True'
	},
	{
		minDifficulty: 5,
		premises: ['All {a} are {b}.', 'Some {b} are not {c}.'],
		conclusion: 'Some {a} are not {c}.',
		answer: 'Cannot tell'
	}
];

export const syllogism: Generator = (rng, difficulty, { vibe }, id) => {
	const forms = SYLLOGISMS.filter((candidate) => candidate.minDifficulty <= difficulty);
	// Prefer the hardest forms this difficulty unlocks, so level 5 is level 5.
	const hardest = forms.filter((candidate) => candidate.minDifficulty >= difficulty - 1);
	const form = rng.pick(hardest.length > 0 ? hardest : forms);
	const [a, b, c] = rng.sample(SYLLOGISM_TERMS[vibe ?? 'neutral'], 3);
	const fill = (text: string) =>
		text
			.replaceAll('{a}', a ?? '')
			.replaceAll('{b}', b ?? '')
			.replaceAll('{c}', c ?? '');
	// Fixed order: shuffling True/False/Cannot tell would only be confusing.
	const choices = (['True', 'False', 'Cannot tell'] as const).map((label, index) => ({
		id: ['a', 'b', 'c'][index] ?? label,
		label
	}));
	return {
		id,
		kind: 'syllogism',
		difficulty,
		prompt: `If both statements are true, what about this one? “${capitalise(fill(form.conclusion))}”`,
		display: { type: 'statements', lines: form.premises.map((line) => capitalise(fill(line))) },
		format: 'choice',
		choices,
		answer: choices.find((choice) => choice.label === form.answer)?.id ?? 'a'
	};
};

function capitalise(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
