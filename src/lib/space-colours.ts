/**
 * The colours a space can be shown in. The pure half; see docs/contexts.md.
 *
 * A colour is each member's own choice of how a space looks to *them*
 * (`space_members.colour`), never shared with the other members, and it comes
 * from this closed list rather than being free: it is stored in the clear,
 * and a free-form value would be a covert channel beside the sealed content
 * (the same reason `THREAD_ICONS` is a list).
 *
 * The palette is the "signature hues": each colour is one basic colour name,
 * at its own most characteristic lightness, so a single colour seen alone
 * says whose it is. Your own space is always blue (`--space-colour-me`), so
 * blue is not in the list. Orange and brown are left out because the app's
 * amber accent and its rust surfaces own them. The list is in order of
 * preference, since default assignment takes the first free one and most
 * people only ever see the first few: yellow and red come last because
 * yellow neighbours the amber and red is the app's error colour. Dark ink
 * stays legible on every one (at least 5:1). Each is a token in `theme.css`
 * (`--space-colour-<name>`).
 *
 * Alias-free: the Drizzle schema imports `SpaceColour`.
 */

export const SPACE_COLOURS = ['green', 'pink', 'purple', 'teal', 'red', 'yellow'] as const;

export type SpaceColour = (typeof SPACE_COLOURS)[number];

/** The words the picker shows. */
export const SPACE_COLOUR_LABELS: Record<SpaceColour, string> = {
	green: 'Green',
	pink: 'Pink',
	purple: 'Purple',
	teal: 'Teal',
	red: 'Red',
	yellow: 'Yellow'
};

export function isSpaceColour(value: unknown): value is SpaceColour {
	return typeof value === 'string' && (SPACE_COLOURS as readonly string[]).includes(value);
}

/**
 * A stored choice, or null for none. A name that is not on the list — one
 * from an older palette that a migration missed, say — reads as not chosen,
 * so it falls back to a default rather than drawing nothing or throwing.
 */
export function storedSpaceColour(value: unknown): SpaceColour | null {
	return isSpaceColour(value) ? value : null;
}

/**
 * Every shared space's colour as the viewer sees it: the one they chose, or
 * one assigned in order from the colours nobody chose, so two partners look
 * different without anyone having picked, and the answer is stable without a
 * write. `spaces` is in the viewer's order (oldest partnership first). A
 * stored value not on the list counts as unchosen (`storedSpaceColour`).
 */
export function resolveSpaceColours(
	spaces: readonly { id: string; colour: string | null }[]
): Map<string, SpaceColour> {
	const chosenBy = spaces.map((space) => ({
		id: space.id,
		colour: storedSpaceColour(space.colour)
	}));
	const chosen = new Set(chosenBy.flatMap((space) => (space.colour ? [space.colour] : [])));
	const free = SPACE_COLOURS.filter((colour) => !chosen.has(colour));
	// Every colour chosen already: defaults cycle the whole list instead.
	const pool = free.length > 0 ? free : SPACE_COLOURS;
	const result = new Map<string, SpaceColour>();
	let next = 0;
	for (const space of chosenBy) {
		if (space.colour) {
			result.set(space.id, space.colour);
		} else {
			result.set(space.id, pool[next % pool.length] ?? SPACE_COLOURS[0]);
			next += 1;
		}
	}
	return result;
}

/** The CSS colour for a space: the token for a partner's, or your own's (`me`, blue). */
export function spaceColourValue(colour: SpaceColour | 'me'): string {
	return `var(--space-colour-${colour})`;
}
