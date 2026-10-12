import type { Rng } from '../random';
import type { Difficulty, Generator } from './types';
import { type Countable, WORD_PROBLEM_CAST } from './words';

type Cast = { subject: string; possessive: string; item: Countable };
type Template = (rng: Rng, cast: Cast) => { prompt: string; answer: number };

/**
 * Arithmetic dressed as a story, easiest first. Every template is built so the
 * answer is a whole number: a remainder would make a typed answer ambiguous.
 *
 * The story's wording comes from the cast (see `Countable`), so each vibe's
 * version reads as an ordinary sentence about its own world.
 */
const TEMPLATES: Record<Difficulty, readonly Template[]> = {
	1: [
		(rng, { subject, item }) => {
			const a = rng.int(3, 9);
			const b = rng.int(2, 6);
			return {
				prompt: `${subject} ${item.have(a)} and ${item.add(b)}. How many now?`,
				answer: a + b
			};
		}
	],
	2: [
		(rng, { subject, item }) => {
			const a = rng.int(10, 20);
			const b = rng.int(3, 9);
			const c = rng.int(2, 5);
			return {
				prompt: `${subject} ${item.have(a)}, ${item.add(b)}, then ${item.remove(c)}. How many are left?`,
				answer: a + b - c
			};
		}
	],
	3: [
		(rng, { subject, item }) => {
			const each = rng.int(3, 8);
			const days = rng.int(4, 9);
			const extra = rng.int(2, 9);
			return {
				prompt: `${subject} ${item.perDay(each)} for ${days} days, plus ${extra} more on the last day. How many in total?`,
				answer: each * days + extra
			};
		},
		(rng) => {
			const number = rng.int(4, 20);
			const add = rng.int(3, 15);
			return {
				prompt: `A number is doubled, then ${add} is added. The result is ${number * 2 + add}. What was the number?`,
				answer: number
			};
		}
	],
	4: [
		(rng, { subject, item }) => {
			const total = rng.int(4, 9) * 10;
			const percent = rng.pick([10, 20, 30, 40, 60, 70]);
			return {
				prompt: `${subject} ${item.have(total)} and ${item.remove(`${percent}% of them`)}. How many are left?`,
				answer: total - (total * percent) / 100
			};
		},
		(rng) => {
			const people = rng.pick([2, 3, 4, 6]);
			const hours = rng.pick([6, 12, 24]);
			const more = people * 2;
			return {
				prompt: `${people} people take ${hours} hours to do a job. How many hours would ${more} people take, working at the same rate?`,
				answer: (people * hours) / more
			};
		}
	],
	5: [
		(rng, { subject, possessive, item }) => {
			const ratioA = rng.int(2, 5);
			const ratioB = rng.int(1, ratioA - 1);
			const unit = rng.int(3, 9);
			return {
				prompt: `${subject} splits ${possessive} ${item.noun} into two groups in the ratio ${ratioA}:${ratioB}. The bigger group has ${ratioA * unit}. How many are there altogether?`,
				answer: (ratioA + ratioB) * unit
			};
		},
		(rng) => {
			const speed = rng.pick([30, 40, 60]);
			const back = speed / 2;
			const distance = speed * rng.pick([1, 2, 3]);
			return {
				prompt: `A trip of ${distance} km out is driven at ${speed} km/h and the same ${distance} km back at ${back} km/h. How many hours does the whole trip take?`,
				answer: distance / speed + distance / back
			};
		}
	]
};

export const wordProblem: Generator = (rng, difficulty, { vibe }, id) => {
	const cast = WORD_PROBLEM_CAST[vibe ?? 'neutral'];
	const { prompt, answer } = rng.pick(TEMPLATES[difficulty])(rng, {
		subject: cast.subject,
		possessive: cast.possessive,
		item: rng.pick(cast.items)
	});
	return {
		id,
		kind: 'word-problem',
		difficulty,
		prompt,
		display: { type: 'none' },
		format: 'text',
		answer: String(answer),
		match: 'number',
		inputMode: 'numeric'
	};
};
