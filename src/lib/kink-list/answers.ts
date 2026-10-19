import { z } from 'zod';
import {
	catalog,
	depthOf,
	domSideOf,
	type KinkItem,
	kinkById,
	leanOf,
	primaryCategoryOf,
	sidesOf
} from './catalog';

/**
 * Answers to the kink list: their shape, the rules for what an unanswered kink
 * shows, and merging two copies of a list. Pure and alias-free; the sealed
 * kind, the device store and the share link all validate with the schema here.
 * See docs/kink-list.md.
 */

// ── levels ───────────────────────────────────────────────────────────────────

/** The one scale every kink is answered on by default, from no to yes. */
export const LEVELS = [
	'limit',
	'not-for-me',
	'conditional',
	'dont-mind',
	'curious',
	'like',
	'love'
] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
	limit: 'Hard limit',
	'not-for-me': 'Not for me',
	conditional: 'Conditional',
	'dont-mind': "Don't mind",
	curious: 'Curious',
	like: 'Like',
	love: 'Love'
};

/** Answers that mean "yes, in some way": the quick-fill deck drills into these. */
export const POSITIVE_LEVELS: ReadonlySet<Level> = new Set([
	'conditional',
	'curious',
	'like',
	'love'
]);

export function isPositive(level: Level | undefined): boolean {
	return level !== undefined && POSITIVE_LEVELS.has(level);
}

// ── the detailed answer ──────────────────────────────────────────────────────

/** The three sliders of a detailed answer, each 0–4. */
export const DETAIL_KEYS = ['fantasy', 'doing', 'experience'] as const;
export type DetailKey = (typeof DETAIL_KEYS)[number];

export const DETAIL_LABELS: Record<DetailKey, string> = {
	fantasy: 'Into it as a fantasy',
	doing: 'Into actually doing it',
	experience: 'Experience'
};

const INTEREST_STEPS = ['None', 'A little', 'Some', 'A lot', "Can't get enough"] as const;
export const DETAIL_STEPS: Record<DetailKey, readonly string[]> = {
	fantasy: INTEREST_STEPS,
	doing: INTEREST_STEPS,
	experience: ['Never', 'Once or twice', 'A few times', 'Often', 'All the time']
};

export const DETAIL_MAX = 4;

// ── the stored shape ─────────────────────────────────────────────────────────

/** The longest note on a kink, in characters. */
export const MAX_NOTE_LENGTH = 1000;
export const MAX_CUSTOM_NAME_LENGTH = 80;
export const MAX_CUSTOM_DESCRIPTION_LENGTH = 300;
export const MAX_CUSTOM_ITEMS = 200;

const CUSTOM_KEY = /^custom:[A-Za-z0-9_-]{8,32}$/;
const CATALOG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A catalogue id, or `custom:<random>` for a kink someone added themselves. */
export type ItemKey = string;
export function isCustomKey(key: string): key is `custom:${string}` {
	return CUSTOM_KEY.test(key);
}

/**
 * A key for a new custom kink. `getRandomValues` rather than `randomUUID`,
 * which browsers only provide on a secure origin, and the list without an
 * account is also reached over plain HTTP (docs/playroom.md has the IQ test's
 * version of the same trap).
 */
export function newCustomKey(): `custom:${string}` {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	let text = '';
	for (const byte of bytes) {
		text += byte.toString(16).padStart(2, '0');
	}
	return `custom:${text}`;
}

const itemKey = z
	.string()
	.refine((key) => CATALOG_ID.test(key) || isCustomKey(key), 'Malformed key');
const at = z.number().int().nonnegative();
const step = z.number().int().min(0).max(DETAIL_MAX);

const detailSchema = z.object({
	fantasy: step.optional(),
	doing: step.optional(),
	experience: step.optional()
});
const sideSchema = z.object({
	level: z.enum(LEVELS).optional(),
	detail: detailSchema.optional()
});
export const answerSchema = z.object({
	level: z.enum(LEVELS).optional(),
	/** `a` and `b` are the two sides of the item's role pair, in the catalogue's order. */
	sides: z.object({ a: sideSchema.optional(), b: sideSchema.optional() }).optional(),
	detail: detailSchema.optional(),
	note: z.string().max(MAX_NOTE_LENGTH).optional(),
	/**
	 * When this answer last changed, in ms. Two copies of a list merge per
	 * kink by this, so an answer changed on one device is not lost to an
	 * older save from another. An answer with nothing else in it is a
	 * cleared one, kept so the clearing merges too.
	 */
	at
});
export type Detail = z.output<typeof detailSchema>;
export type Side = z.output<typeof sideSchema>;
export type Answer = z.output<typeof answerSchema>;
export type SideKey = 'a' | 'b';

const customSchema = z.object({
	name: z.string().trim().min(1).max(MAX_CUSTOM_NAME_LENGTH),
	categoryId: z.string().regex(CATALOG_ID),
	description: z.string().trim().max(MAX_CUSTOM_DESCRIPTION_LENGTH).optional(),
	/** A removed custom kink, kept so the removal merges like any other change. */
	removed: z.boolean().optional(),
	at
});
export type CustomKink = z.output<typeof customSchema>;

/**
 * A category's quick-fill triage: skipped in the deck, or a hard limit for
 * everything whose primary category it is. Nothing positive is ever set at
 * this level — see `effectiveAnswer` for why.
 */
const triageSchema = z.object({ value: z.enum(['skip', 'limit', 'none']), at });
export type TriageValue = z.output<typeof triageSchema>['value'];

/**
 * Which side someone is on, for hiding what leans the other way: a kink's
 * dom context from a sub, a sub-only kink from a dom. `both` hides nothing.
 */
export const YOUR_SIDES = ['dom', 'sub', 'both'] as const;
export type YourSide = (typeof YOUR_SIDES)[number];
export const YOUR_SIDE_LABELS: Record<YourSide, string> = { dom: 'Dom', sub: 'Sub', both: 'Both' };

/**
 * One answer in the shape its kink takes: a kink with a role pair is answered
 * per side only, and one without is answered whole only. A whole answer on a
 * role kink — from quick fill's "Both", an import that had no sides, or a
 * list from before contexts were always shown — becomes the same answer on
 * each side. A sided answer on a kink with no pair keeps its first side.
 *
 * Done when a list is parsed and when an answer is set, so nothing past those
 * two points ever has to ask which shape it is looking at; the history, the
 * comparison and the exports all read one shape.
 */
export function normaliseAnswer<A extends Answer>(key: ItemKey, answer: A): A {
	const item = kinkById(key);
	const sided = item !== undefined && sidesOf(item) !== null;
	if (sided && (answer.level !== undefined || answer.detail !== undefined)) {
		const whole = { level: answer.level, detail: answer.detail };
		const side = (current: Side | undefined): Side => {
			const level = current?.level ?? whole.level;
			const detail = current?.detail ?? whole.detail;
			return { ...(level ? { level } : {}), ...(detail ? { detail } : {}) };
		};
		const { level: _level, detail: _detail, ...rest } = answer;
		return { ...rest, sides: { a: side(answer.sides?.a), b: side(answer.sides?.b) } } as A;
	}
	if (!sided && answer.sides !== undefined) {
		const first = answer.sides.a ?? answer.sides.b;
		const { sides: _sides, ...rest } = answer;
		const level = answer.level ?? first?.level;
		const detail = answer.detail ?? first?.detail;
		return { ...rest, ...(level ? { level } : {}), ...(detail ? { detail } : {}) } as A;
	}
	return answer;
}

export function normaliseAnswers<A extends Answer>(answers: Record<string, A>): Record<string, A> {
	return Object.fromEntries(
		Object.entries(answers).map(([key, answer]) => [key, normaliseAnswer(key, answer)])
	);
}

export const listPayloadSchema = z.object({
	answers: z.record(itemKey, answerSchema).transform(normaliseAnswers),
	triage: z.record(z.string().regex(CATALOG_ID), triageSchema),
	custom: z.record(z.string().regex(CUSTOM_KEY), customSchema),
	settings: z.object({
		maxIntensity: z.number().int().min(0).max(6),
		/**
		 * Kinks less common than this are hidden: 0 rare … 4 very common.
		 * Defaulted, like `side`, so a list saved before either existed still
		 * opens rather than being refused as unreadable.
		 */
		minCommonness: z.number().int().min(0).max(4).default(catalog.commonness.defaultMin),
		side: z.enum(YOUR_SIDES).default('both'),
		at
	}),
	/** Cards skipped in the quick-fill deck, and when; `false` puts one back. */
	skipped: z.record(itemKey, z.object({ skipped: z.boolean(), at }))
});
export type ListPayload = z.output<typeof listPayloadSchema>;

export function emptyList(): ListPayload {
	return {
		answers: {},
		triage: {},
		custom: {},
		settings: {
			maxIntensity: catalog.intensity.defaultMax,
			minCommonness: catalog.commonness.defaultMin,
			side: 'both',
			at: 0
		},
		skipped: {}
	};
}

/** Whether an answer has anything in it, as opposed to being a cleared one. */
export function hasContent(answer: Answer | undefined): boolean {
	if (!answer) {
		return false;
	}
	return Boolean(
		answer.level ||
			answer.note ||
			hasDetail(answer.detail) ||
			sideHasContent(answer.sides?.a) ||
			sideHasContent(answer.sides?.b)
	);
}

function hasDetail(detail: Detail | undefined): boolean {
	return detail !== undefined && DETAIL_KEYS.some((key) => detail[key] !== undefined);
}

function sideHasContent(side: Side | undefined): boolean {
	return side !== undefined && (side.level !== undefined || hasDetail(side.detail));
}

/** Whether an item has an answer of its own on the scale, for either side. */
export function isAnswered(answer: Answer | undefined): boolean {
	return Boolean(answer?.level || answer?.sides?.a?.level || answer?.sides?.b?.level);
}

// ── what an item shows ───────────────────────────────────────────────────────

/** Where an effective answer came from. */
export type AnswerSource =
	| { kind: 'own' }
	/** A specific showing its kink's answer. */
	| { kind: 'parent'; itemId: string }
	/** A "Hard limit everything here" from the category's triage. */
	| { kind: 'category'; categoryId: string };

export type Effective = { level?: Level; detail?: Detail; source?: AnswerSource };

function ownSide(answer: Answer | undefined, side: SideKey | undefined): Effective | null {
	if (!answer) {
		return null;
	}
	const sided = side ? answer.sides?.[side] : undefined;
	const level = sided?.level ?? answer.level;
	const detail = sided?.detail ?? answer.detail;
	return level || hasDetail(detail) ? { level, detail, source: { kind: 'own' } } : null;
}

/**
 * What an item shows for one side (or for the whole item, with no side):
 *
 * 1. Its own answer for that side, then its own answer for both.
 * 2. For a specific (a third-level item), its kink's own answer. Answers flow
 *    down "kind of" links only: spanking with a paddle is a kind of spanking.
 * 3. A category's "Hard limit everything here", for kinks whose primary
 *    category it is.
 *
 * Nothing positive flows down from a category, and nothing flows into a
 * related kink from a category it is only also under. A "Love" on Impact
 * would otherwise give face slapping a Love from someone who hates
 * degradation (categorisation.md, in the research notes). Notes never flow:
 * they belong to the kink they were written on.
 */
export function effectiveAnswer(list: ListPayload, key: ItemKey, side?: SideKey): Effective {
	const own = ownSide(list.answers[key], side);
	if (own?.level) {
		return own;
	}
	const item = kinkById(key);
	if (item?.parent && depthOf(item) === 3) {
		const fromParent = ownSide(list.answers[item.parent], side);
		if (fromParent?.level) {
			return {
				level: fromParent.level,
				detail: own?.detail ?? fromParent.detail,
				source: { kind: 'parent', itemId: item.parent }
			};
		}
	}
	const categoryId = item ? primaryCategoryOf(item).id : list.custom[key]?.categoryId;
	if (categoryId && list.triage[categoryId]?.value === 'limit') {
		return {
			level: 'limit',
			detail: own?.detail,
			source: { kind: 'category', categoryId }
		};
	}
	return own ?? {};
}

/** The intensity of an item; custom kinks count as the gentlest, since nothing hides them. */
export function intensityOf(key: ItemKey): number {
	return kinkById(key)?.intensity ?? 0;
}

// ── filters ──────────────────────────────────────────────────────────────────

/** What decides which kinks a list shows: its settings, with the side a partner's view may change. */
export type Filters = { maxIntensity: number; minCommonness: number; side: YourSide };

export function filtersOf(list: ListPayload): Filters {
	const { maxIntensity, minCommonness, side } = list.settings;
	return { maxIntensity, minCommonness, side };
}

/**
 * Whether a catalogue item is shown: within the intensity maximum, at least as
 * common as the minimum, and not a one-sided kink for the other side. A role
 * kink is shown whatever the side — it is its contexts that are filtered
 * (`shownSides`). Custom kinks are not catalogue items, and nothing hides them.
 */
export function isShown(item: KinkItem, filters: Filters): boolean {
	if (item.intensity > filters.maxIntensity) {
		return false;
	}
	if ((item.commonness ?? 0) < filters.minCommonness) {
		return false;
	}
	const lean = leanOf(item);
	return filters.side === 'both' || lean === null || lean === filters.side;
}

/**
 * The contexts of a role kink to show: both, unless the item leans and the
 * side filter is set, in which case only the side's own. Null for an item
 * without a role pair, which is answered whole.
 */
export function shownSides(item: KinkItem | undefined, side: YourSide): SideKey[] | null {
	if (!(item && sidesOf(item))) {
		return null;
	}
	const domSide = domSideOf(item);
	if (side === 'both' || domSide === null) {
		return ['a', 'b'];
	}
	const subSide = domSide === 'a' ? 'b' : 'a';
	return [side === 'dom' ? domSide : subSide];
}

// ── merging ──────────────────────────────────────────────────────────────────

function newer<T extends { at: number }>(a: T | undefined, b: T | undefined): T | undefined {
	if (!a) {
		return b;
	}
	if (!b) {
		return a;
	}
	return b.at > a.at ? b : a;
}

function mergeRecords<T extends { at: number }>(
	a: Record<string, T>,
	b: Record<string, T>
): Record<string, T> {
	const merged: Record<string, T> = { ...a };
	for (const [key, value] of Object.entries(b)) {
		const kept = newer(merged[key], value);
		if (kept) {
			merged[key] = kept;
		}
	}
	return merged;
}

/**
 * Two copies of one list as one: per kink, per category and per custom kink,
 * whichever changed last. This is how a save that lost a race with another
 * device is retried, and how a device's list joins an account's.
 */
export function mergeLists(a: ListPayload, b: ListPayload): ListPayload {
	return {
		answers: mergeRecords(a.answers, b.answers),
		triage: mergeRecords(a.triage, b.triage),
		custom: mergeRecords(a.custom, b.custom),
		settings: newer(a.settings, b.settings) ?? a.settings,
		skipped: mergeRecords(a.skipped, b.skipped)
	};
}

/** How many kinks, custom ones included, have an answer of their own. */
export function answeredCount(list: ListPayload): number {
	return Object.values(list.answers).filter(isAnswered).length;
}
