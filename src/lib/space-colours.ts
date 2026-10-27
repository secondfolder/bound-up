/**
 * The colours a space can be shown in. The pure half; see docs/contexts.md.
 *
 * A colour is each member's own choice of how a space looks to *them*
 * (`space_members.colour`), never shared with the other members, and it comes
 * from this closed list rather than being free: it is stored in the clear,
 * and a free-form value would be a covert channel beside the sealed content
 * (the same reason `THREAD_ICONS` is a list).
 *
 * Your own space is always amber, the app's accent, so it is not in the list:
 * the partner colours are the ones that read beside it on the dark theme with
 * dark ink on them. Each is a token in `theme.css` (`--space-colour-<name>`).
 *
 * Alias-free: the Drizzle schema imports `SpaceColour`.
 */

export const SPACE_COLOURS = ['teal', 'violet', 'blue', 'pink', 'green', 'lime'] as const;

export type SpaceColour = (typeof SPACE_COLOURS)[number];

/** The words the picker shows. */
export const SPACE_COLOUR_LABELS: Record<SpaceColour, string> = {
	teal: 'Teal',
	violet: 'Violet',
	blue: 'Blue',
	pink: 'Pink',
	green: 'Green',
	lime: 'Lime'
};

export function isSpaceColour(value: unknown): value is SpaceColour {
	return typeof value === 'string' && (SPACE_COLOURS as readonly string[]).includes(value);
}

/**
 * Every shared space's colour as the viewer sees it: the one they chose, or
 * one assigned in order from the colours nobody chose, so two partners look
 * different without anyone having picked, and the answer is stable without a
 * write. `spaces` is in the viewer's order (oldest partnership first).
 */
export function resolveSpaceColours(
	spaces: readonly { id: string; colour: SpaceColour | null }[]
): Map<string, SpaceColour> {
	const chosen = new Set(spaces.flatMap((space) => (space.colour ? [space.colour] : [])));
	const free = SPACE_COLOURS.filter((colour) => !chosen.has(colour));
	// Every colour chosen already: defaults cycle the whole list instead.
	const pool = free.length > 0 ? free : SPACE_COLOURS;
	const result = new Map<string, SpaceColour>();
	let next = 0;
	for (const space of spaces) {
		if (space.colour) {
			result.set(space.id, space.colour);
		} else {
			result.set(space.id, pool[next % pool.length] ?? 'teal');
			next += 1;
		}
	}
	return result;
}

/** The CSS colour for a space: the token for a partner's, the accent for your own. */
export function spaceColourValue(colour: SpaceColour | 'me'): string {
	return `var(--space-colour-${colour})`;
}
