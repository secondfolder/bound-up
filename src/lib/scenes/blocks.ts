/**
 * The scene blocks' vocabulary, shared by the editor's nodes, the stored
 * document's schema and its renderer. Alias-free and pure: the read path
 * (`richtext.ts`, `RichText.svelte`) must not import Lexical, and this is the
 * half of the blocks it needs. See docs/scenes.md, "Blocks".
 */

/**
 * The kinds of section a scene's page can hold. A prompt's text lands in the section
 * of its kind; `notes` are plain lines on the page.
 */
export const SCENE_SECTIONS = [
	'notes',
	'signals',
	'limits',
	'aftercare',
	'ritual',
	'prep',
	'story'
] as const;
export type SceneSection = (typeof SCENE_SECTIONS)[number];

export const SECTION_LABELS: Record<SceneSection, string> = {
	notes: 'Notes',
	signals: 'Signals',
	limits: 'Limits',
	aftercare: 'Aftercare',
	ritual: 'Rituals',
	prep: 'Beforehand',
	story: 'Story'
};

/**
 * A menu's own words above its courses: a title, which takes the place of
 * the design's (empty for the design's), and a subtitle under it (empty for
 * none).
 */
export type MenuHeading = { title: string; subtitle: string };

/** The longest a menu's title can be: it is set large, in a heading. */
export const MAX_MENU_TITLE = 60;
/** The longest a menu's subtitle can be: a line, not a paragraph. */
export const MAX_MENU_SUBTITLE = 100;

/**
 * A line of a menu: a heading, which starts a course; a subheading, within
 * one; or an item.
 */
export type MenuLineRole = 'heading' | 'subheading' | 'item';

/** An item's place on a menu's scale, when the menu has one: 1 to 5. */
export const MAX_RATING = 5;

export function isRating(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_RATING;
}

/**
 * What a menu's items carry besides their words, each off until someone
 * turns it on in the menu's options: a rating on a scale of one to five,
 * and a number (a price, mostly, however the design writes it). Each is
 * named by whoever turns it on, and the name is the menu's key to it; an
 * empty name is on but unexplained.
 */
export type MenuExtras = {
	/** The scale's name, or null when items are not rated. */
	scale: string | null;
	/** What an item's number means, or null when items have none. */
	value: string | null;
};

/** The longest name a scale or a value can have: it is a key, not a sentence. */
export const MAX_EXTRA_LABEL = 40;

/** The courses a new menu starts with, each a heading someone can rename or delete. */
export const DEFAULT_COURSES = ['Starters', 'Mains', 'Dessert', 'Aftercare'] as const;

export function isSceneSection(value: unknown): value is SceneSection {
	return (
		value === 'notes' ||
		value === 'signals' ||
		value === 'limits' ||
		value === 'aftercare' ||
		value === 'ritual' ||
		value === 'prep' ||
		value === 'story'
	);
}

/**
 * Whether a block or item is drawn as a surprise for `viewerId`: it was
 * hidden from them by the other partner. Hiding is on screen only (both
 * partners hold the key), which docs/scenes.md says plainly.
 */
export function isSurpriseFor(hiddenFrom: string | null | undefined, viewerId: string | null) {
	return hiddenFrom !== null && hiddenFrom !== undefined && hiddenFrom === viewerId;
}

/**
 * An item's rating and number as words, for an item that leaves the menu
 * ("back to text"): "(Effort 3/5, Cost $12)".
 */
export function itemExtrasText(
	item: { rating: number | null; value: number | null },
	extras: MenuExtras,
	writeValue: (value: number) => string
): string {
	const parts: string[] = [];
	if (extras.scale !== null && item.rating !== null) {
		parts.push(
			`${extras.scale === '' ? 'Rated' : extras.scale} ${item.rating}/${MAX_RATING}`.trim()
		);
	}
	if (extras.value !== null && item.value !== null) {
		parts.push(`${extras.value} ${writeValue(item.value)}`.trim());
	}
	return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}
