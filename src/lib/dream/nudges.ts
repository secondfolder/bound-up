/**
 * Nudges: random suggestions code adds to step 1, so the same brief does not
 * start from the same default every time (docs/dreams.md, "Reading the
 * brief"). The model may set one aside when it fights the brief; they are
 * suggestions, never categories a story has to fit.
 *
 * Each dimension is a list of fragments. Grow them freely: a longer list is
 * more variety, and nothing else reads them.
 *
 * Pure and alias-free.
 */

import { drawDistinct, type Random } from './random';

export const NUDGE_DIMENSIONS: Readonly<Record<string, readonly string[]>> = {
	Setting: [
		'somewhere usually open to the public',
		'somewhere very small',
		'somewhere outdoors',
		'a workplace after hours',
		'somewhere one of them owns',
		'a vehicle',
		'somewhere neither of them should be',
		'a place with a lot of rules of its own',
		'somewhere ordinary, made strange',
		'a hotel, a ship or a train'
	],
	Era: [
		'present day',
		'an unspecified past',
		'the near future',
		'a period piece, lightly worn',
		'out of time entirely'
	],
	Form: [
		'consider a form other than plain prose for some or all of it',
		'consider telling it in documents from inside its world',
		'consider a single unbroken scene',
		'consider letters or messages',
		'consider a series of short vignettes',
		'consider one voice speaking throughout'
	],
	Power: [
		'power that comes from expertise',
		'power that comes from money',
		'power that was handed over freely',
		'power that is about to change hands',
		'power that nobody says out loud',
		'power held by an institution rather than a person'
	],
	Relationship: [
		'strangers',
		'people who already know each other well',
		'people who used to know each other',
		'colleagues',
		'one of them has been waiting for this',
		'neither expected to be here'
	],
	Senses: [
		'a story told through sound',
		'a story told through touch and temperature',
		'a story full of smells',
		'a very visual story',
		'a story about stillness'
	],
	Pace: [
		'slow at first',
		'starts in the middle of things',
		'patient throughout',
		'quick and breathless'
	],
	Complication: [
		'someone else might find out',
		'a deadline',
		'a rule that has to be broken',
		'a misunderstanding nobody corrects',
		'something one of them has not admitted',
		'a witness'
	]
};

export type Nudge = { dimension: string; text: string };

/** Two or three nudges, from different dimensions. */
export function drawNudges(random: Random, count = 2 + Math.floor(random() * 2)): Nudge[] {
	const dimensions = drawDistinct(Object.keys(NUDGE_DIMENSIONS), count, random);
	return dimensions.map((dimension) => {
		const options = NUDGE_DIMENSIONS[dimension] ?? [];
		return { dimension, text: options[Math.floor(random() * options.length)] ?? '' };
	});
}
