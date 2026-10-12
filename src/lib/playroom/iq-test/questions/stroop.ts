import { shuffledChoices } from './choices';
import { COLOURS, type Colour, type Generator } from './types';

/**
 * Colour words printed in a colour they do not name.
 *
 * Which half is asked for — the word or the ink — is chosen per question, so a
 * taker cannot settle into one habit.
 *
 * - "What colour is the ink?" is answered with colour words, and from
 *   difficulty 3 those are themselves printed in clashing inks.
 * - "What does it say?" is answered with blocks of colour, not words, so
 *   reading the answer cannot stand in for matching it: the word read has to
 *   be turned into a colour while the ink on screen pulls the other way.
 */
export const stroop: Generator = (rng, difficulty, _context, id) => {
	const [word, ink] = rng.sample(COLOURS, 2) as [Colour, Colour];
	const askInk = rng.chance(0.5);
	const correct = askInk ? ink : word;
	const others = rng.sample(
		COLOURS.filter((colour) => colour !== word && colour !== ink),
		difficulty >= 2 ? 2 : 3
	);
	// The other half of the pair is always on offer: it is the wrong answer
	// people actually give.
	const distractors = [askInk ? word : ink, ...others];
	const inkFor = (label: Colour): Colour | undefined => {
		if (difficulty < 3) {
			return undefined;
		}
		return rng.pick(COLOURS.filter((colour) => colour !== label));
	};
	return {
		id,
		kind: 'stroop',
		difficulty,
		prompt: askInk
			? 'What colour is the ink this word is printed in?'
			: 'What does this word say? Ignore the colour.',
		display: { type: 'stroop', words: [{ word, ink }] },
		format: 'choice',
		...(askInk
			? shuffledChoices(
					rng,
					{ label: correct, ink: inkFor(correct) },
					distractors.map((label) => ({ label, ink: inkFor(label) }))
				)
			: shuffledChoices(
					rng,
					{ label: correct, swatch: correct },
					distractors.map((label) => ({ label, swatch: label }))
				))
	};
};

/**
 * Several colour words at once: count the ones whose ink matches the word.
 * Typed, because the count is easy to guess from a short list of options.
 */
export const stroopCount: Generator = (rng, difficulty, _context, id) => {
	const length = difficulty + 3;
	const matches = rng.int(0, Math.min(3, length));
	const matching = new Set(
		rng.sample(
			Array.from({ length }, (_, index) => index),
			matches
		)
	);
	const words = Array.from({ length }, (_, index) => {
		const word = rng.pick(COLOURS);
		return {
			word,
			ink: matching.has(index) ? word : rng.pick(COLOURS.filter((colour) => colour !== word))
		};
	});
	return {
		id,
		kind: 'stroop-count',
		difficulty,
		prompt: 'How many of these words are printed in the colour they name?',
		display: { type: 'stroop', words },
		format: 'text',
		answer: String(matches),
		match: 'number',
		inputMode: 'numeric'
	};
};
