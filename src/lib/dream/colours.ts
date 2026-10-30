/**
 * Each person's colour in a daydream (docs/dreams.md, "Colours"): who is
 * speaking, at a glance, in their speech, their name and their card. The
 * user is always the blue that is theirs everywhere else (the "Me"
 * context's), and each character is given one of the contexts' own colours,
 * in the order they came into the story, so two people never share one
 * until there are more people than colours. Code assigns them, never the
 * model, and nothing is stored: the order of the elements decides, and it
 * only ever grows.
 *
 * Pure and alias-free.
 */

import { SPACE_COLOURS, type SpaceColour } from '../space-colours';

export type DreamColour = 'me' | SpaceColour;

/** The id `<say who="you">` and a texts block's own messages use for the user. */
export const YOU_ID = 'you';

/**
 * Each character's colour, and the user's, by element id. The user is
 * there whether or not the daydream has a `<you>` element, since a passage
 * can always have them speak.
 */
export function elementColours(
	elements: readonly { id: string; type: string }[]
): Map<string, DreamColour> {
	const colours = new Map<string, DreamColour>([[YOU_ID, 'me']]);
	let next = 0;
	for (const element of elements) {
		if (element.type === 'you') {
			colours.set(element.id, 'me');
		} else if (element.type === 'character' && !colours.has(element.id)) {
			colours.set(element.id, SPACE_COLOURS[next % SPACE_COLOURS.length] ?? SPACE_COLOURS[0]);
			next += 1;
		}
	}
	return colours;
}

/** A colour as CSS: the theme's token for it (`--space-colour-<name>`). */
export function colourValue(colour: DreamColour): string {
	return `var(--space-colour-${colour})`;
}

/** Each element's colour as CSS, by id, for the components that draw them. */
export function colourValues(
	elements: readonly { id: string; type: string }[]
): Map<string, string> {
	return new Map(
		[...elementColours(elements)].map(([id, colour]) => [id, colourValue(colour)] as const)
	);
}
