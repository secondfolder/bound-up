import { z } from 'zod';
import data from './catalog.json' with { type: 'json' };
import shareIdsData from './share-ids.json' with { type: 'json' };

/**
 * The kink list's catalogue: every kink a person can answer, in a tree of at
 * most three levels — category, kink, specific. See docs/kink-list.md.
 *
 * `catalog.json` was generated from the research in `.local/kinks/` (ten public
 * kink lists, merged, with descriptions written for this app) and is edited by
 * hand from here on. It is validated here when the module loads, like the
 * roadmap, so a bad edit fails the tests and the type check rather than
 * showing someone a broken list.
 *
 * The content is explicit adult material: that is the point of it. Treat it as
 * data, as AGENTS.md says of the seed prose.
 *
 * Alias-free and server-free: the browser, the server and the tests all import
 * it directly.
 */

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ids are kebab-case');

const itemSchema = z.strictObject({
	id,
	name: z.string().min(1),
	/** Absent on a category; a category's id or a kink's id otherwise. */
	parent: id.optional(),
	/** Categories only: which part of the list they sit in. */
	section: z.string().optional(),
	/** A role pair from `roles`, for kinks that can be answered for each side. */
	roles: z.string().optional(),
	intensity: z.number().int().min(0).max(6),
	/**
	 * Kinks and specifics only: how many people are into it or know of it,
	 * from 0 (rare) to 4 (very common). Independent of intensity — balloons
	 * are mild and rare, choking intense and well known.
	 */
	commonness: z.number().int().min(0).max(4).optional(),
	/**
	 * Which side of the role pair a dominant usually takes, overriding the
	 * pair's own default; `neutral` when either side suits either. The "Your
	 * side" filter hides the side that leans the other way.
	 */
	domSide: z.enum(['a', 'b', 'neutral']).optional(),
	/** For a kink with no role pair that is only ever one person's side. */
	lean: z.enum(['dom', 'sub']).optional(),
	tags: z.array(z.string()).optional(),
	/** Search terms: synonyms, slang and abbreviations people type. */
	aliases: z.array(z.string().min(1)).optional(),
	description: z.string().min(1),
	/** Shown with the description for kinks that carry real risk. */
	safety: z.string().optional(),
	/**
	 * Categories this kink also fits, beyond its primary one. Each lists it
	 * under "N related kinks", where it can be answered too: it is the same
	 * item, so the answer is shared.
	 */
	alsoUnder: z.array(id).optional()
});

export const catalogSchema = z
	.strictObject({
		version: z.literal(1),
		intensity: z.strictObject({
			levels: z.record(z.string(), z.string()),
			defaultMax: z.number().int().min(0).max(6)
		}),
		commonness: z.strictObject({
			levels: z.record(z.string(), z.string()),
			defaultMin: z.number().int().min(0).max(4)
		}),
		sections: z.record(z.string(), z.string()),
		/**
		 * Role pairs: the two sides' labels, side `a` being the active, giving,
		 * dom or self one; and which side a dominant usually takes, or null for
		 * a pair where that depends on the kink (or on nothing).
		 */
		roles: z.record(
			z.string(),
			z.strictObject({
				labels: z.tuple([z.string(), z.string()]),
				domSide: z.enum(['a', 'b']).nullable()
			})
		),
		tags: z.record(z.string(), z.string()),
		items: z.array(itemSchema).min(1)
	})
	.superRefine((parsed, ctx) => {
		for (const problem of catalogProblems(parsed, shareIdsData)) {
			ctx.addIssue({ code: 'custom', message: problem });
		}
	});

export type Catalog = z.output<typeof catalogSchema>;
export type KinkItem = z.output<typeof itemSchema>;

/** How deep an item sits: 1 for a category, 2 for a kink, 3 for a specific. */
function depthIn(items: Map<string, KinkItem>, item: KinkItem): number {
	let depth = 1;
	let current = item;
	while (current.parent) {
		const parent = items.get(current.parent);
		if (!parent || depth > 3) {
			return Number.POSITIVE_INFINITY;
		}
		current = parent;
		depth += 1;
	}
	return depth;
}

/**
 * The rules no single item can check. Exported for the tests, which feed it
 * hand-made broken catalogues.
 */
export function catalogProblems(
	parsed: Pick<Catalog, 'items' | 'sections' | 'roles' | 'tags'>,
	shareIds: readonly string[]
): string[] {
	const problems: string[] = [];
	const byId = new Map<string, KinkItem>();
	for (const item of parsed.items) {
		if (byId.has(item.id)) {
			problems.push(`duplicate id "${item.id}"`);
		}
		byId.set(item.id, item);
	}
	for (const item of parsed.items) {
		if (item.parent && !byId.has(item.parent)) {
			problems.push(`"${item.id}" has an unknown parent "${item.parent}"`);
		}
		const depth = depthIn(byId, item);
		if (depth > 3) {
			problems.push(`"${item.id}" is deeper than three levels`);
		}
		if (item.parent === undefined && !(item.section && item.section in parsed.sections)) {
			problems.push(`category "${item.id}" has no known section`);
		}
		if (item.parent !== undefined && item.section !== undefined) {
			problems.push(`"${item.id}" is not a category but has a section`);
		}
		if (item.roles && !(item.roles in parsed.roles)) {
			problems.push(`"${item.id}" has an unknown role pair "${item.roles}"`);
		}
		if (item.parent === undefined && item.commonness !== undefined) {
			problems.push(`category "${item.id}" has a commonness; only kinks do`);
		}
		if (item.parent !== undefined && item.commonness === undefined) {
			problems.push(`"${item.id}" has no commonness`);
		}
		const parent = item.parent ? byId.get(item.parent) : undefined;
		if (
			parent?.parent !== undefined &&
			item.commonness !== undefined &&
			parent.commonness !== undefined &&
			item.commonness > parent.commonness
		) {
			// A specific is only reached through its kink, so it cannot be seen
			// by anyone its kink is hidden from.
			problems.push(`"${item.id}" is more common than "${parent.id}", the kink it narrows`);
		}
		if (item.domSide !== undefined && !item.roles) {
			problems.push(`"${item.id}" has a domSide but no role pair`);
		}
		if (item.lean !== undefined && item.roles) {
			problems.push(`"${item.id}" has a lean and a role pair; a pair takes domSide`);
		}
		for (const tag of item.tags ?? []) {
			if (!(tag in parsed.tags)) {
				problems.push(`"${item.id}" has an unknown tag "${tag}"`);
			}
		}
		for (const other of item.alsoUnder ?? []) {
			const category = byId.get(other);
			if (!category || category.parent !== undefined) {
				problems.push(`"${item.id}" is also under "${other}", which is not a category`);
			}
		}
	}
	// Share links and exports refer to items by their place in share-ids.json,
	// so every item needs one; removed items stay there as tombstones.
	const shared = new Set(shareIds);
	for (const item of parsed.items) {
		if (!shared.has(item.id)) {
			problems.push(`"${item.id}" is missing from share-ids.json`);
		}
	}
	if (shared.size !== shareIds.length) {
		problems.push('share-ids.json lists an id twice');
	}
	return problems;
}

export const catalog: Catalog = catalogSchema.parse(data);

/** The append-only order items are numbered in for share links and exports. */
export const SHARE_IDS: readonly string[] = shareIdsData;

const byId = new Map(catalog.items.map((item) => [item.id, item]));
const childrenById = new Map<string | undefined, KinkItem[]>();
for (const item of catalog.items) {
	const siblings = childrenById.get(item.parent) ?? [];
	siblings.push(item);
	childrenById.set(item.parent, siblings);
}

export function kinkById(itemId: string): KinkItem | undefined {
	return byId.get(itemId);
}

/** An item's children, in file order. `undefined` for the categories. */
export function childrenOf(parentId: string | undefined): readonly KinkItem[] {
	return childrenById.get(parentId) ?? [];
}

export function categories(section?: string): KinkItem[] {
	return childrenOf(undefined).filter((item) => section === undefined || item.section === section);
}

export function depthOf(item: KinkItem): 1 | 2 | 3 {
	return depthIn(byId, item) as 1 | 2 | 3;
}

/** The category an item sits in, following parents up. A category is its own. */
export function primaryCategoryOf(item: KinkItem): KinkItem {
	let current = item;
	while (current.parent) {
		const parent = byId.get(current.parent);
		if (!parent) {
			break;
		}
		current = parent;
	}
	return current;
}

/** Kinks whose primary category is elsewhere but which list `categoryId` in `alsoUnder`. */
export function relatedKinks(categoryId: string): KinkItem[] {
	return catalog.items.filter((item) => item.alsoUnder?.includes(categoryId));
}

/** The pair of side labels for an item's role pair, or null for an item answered as one. */
export function sidesOf(item: KinkItem): readonly [string, string] | null {
	return item.roles ? (catalog.roles[item.roles]?.labels ?? null) : null;
}

/**
 * Which side of an item's role pair a dominant usually takes, or null when
 * neither does (or there is no pair). A specific with the same pair as its
 * kink follows the kink unless it says otherwise; then the pair's default.
 */
export function domSideOf(item: KinkItem): 'a' | 'b' | null {
	if (!item.roles) {
		return null;
	}
	const parent = item.parent ? byId.get(item.parent) : undefined;
	const own =
		item.domSide ?? (parent?.parent && parent.roles === item.roles ? parent.domSide : undefined);
	if (own !== undefined) {
		return own === 'neutral' ? null : own;
	}
	return catalog.roles[item.roles]?.domSide ?? null;
}

/** Whether an item with no role pair is only ever a dom's or a sub's; a specific follows its kink. */
export function leanOf(item: KinkItem): 'dom' | 'sub' | null {
	if (item.roles) {
		return null;
	}
	const parent = item.parent ? byId.get(item.parent) : undefined;
	return item.lean ?? (parent?.parent && !parent.roles ? parent.lean : undefined) ?? null;
}

export function intensityLabel(intensity: number): string {
	return catalog.intensity.levels[String(intensity)] ?? String(intensity);
}

export function commonnessLabel(commonness: number): string {
	return catalog.commonness.levels[String(commonness)] ?? String(commonness);
}

/** Lowercase, `&` read as "and", and anything else that isn't a letter or digit as a space. */
export function normaliseSearch(text: string): string {
	return text
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

const searchIndex = catalog.items
	.filter((item) => item.parent !== undefined)
	.map((item) => ({
		item,
		name: normaliseSearch(item.name),
		aliases: (item.aliases ?? []).map(normaliseSearch)
	}));

/**
 * Kinks matching a search, best first: a name that starts with the query, then
 * an alias that does, then a name or alias containing it. Categories are left
 * out; they are what the list is browsed by.
 */
export function searchKinks(query: string): KinkItem[] {
	const needle = normaliseSearch(query);
	if (!needle) {
		return [];
	}
	const scored: { item: KinkItem; score: number }[] = [];
	for (const entry of searchIndex) {
		const wordStart = (text: string) => text.startsWith(needle) || text.includes(` ${needle}`);
		let score = 0;
		if (wordStart(entry.name)) {
			score = 4;
		} else if (entry.aliases.some(wordStart)) {
			score = 3;
		} else if (entry.name.includes(needle)) {
			score = 2;
		} else if (entry.aliases.some((alias) => alias.includes(needle))) {
			score = 1;
		}
		if (score > 0) {
			scored.push({ item: entry.item, score });
		}
	}
	return scored.toSorted((a, b) => b.score - a.score).map((entry) => entry.item);
}
