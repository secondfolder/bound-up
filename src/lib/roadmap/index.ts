import { z } from 'zod';
import data from './roadmap.json' with { type: 'json' };

/**
 * The public roadmap: what has shipped and what is coming, as a three-level
 * tree — branch (a category), leaf (a feature), twig (a piece of one). See
 * docs/roadmap.md.
 *
 * The content lives in `roadmap.json` and is validated here, when the module
 * loads, so a bad edit (a typo in a `dependsOn`, a shipped item with no date)
 * fails the tests, the type check and the dev server rather than rendering a
 * dead link. Alias-free and server-free: components import it directly.
 */

export const ROADMAP_STATUSES = ['shipped', 'in-progress', 'planned', 'exploring'] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export const STATUS_LABELS: Record<RoadmapStatus, string> = {
	shipped: 'Shipped',
	'in-progress': 'In progress',
	planned: 'Planned',
	exploring: 'Exploring'
};

// Ids double as URL fragments (`/roadmap#kink-list`), so they are kept to
// something that needs no escaping in a selector or a URL.
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ids are kebab-case');

const itemFields = {
	id,
	title: z.string().min(1),
	summary: z.string().min(1),
	status: z.enum(ROADMAP_STATUSES),
	icon: z.string().min(1).optional(),
	notes: z.array(z.string().min(1)).optional(),
	featured: z.boolean().optional(),
	shippedOn: z.iso.date().optional(),
	dependsOn: z.array(id).optional()
};

// Strict so a misspelt key (`depends_on`, `shipped`) is an error rather than
// silently ignored. Twigs have no `children`, which is what caps the tree at
// three levels.
const twigSchema = z.strictObject(itemFields);
const leafSchema = z.strictObject({ ...itemFields, children: z.array(twigSchema).optional() });
const branchSchema = z.strictObject({
	id,
	title: z.string().min(1),
	summary: z.string().min(1),
	icon: z.string().min(1),
	items: z.array(leafSchema).min(1)
});

export const roadmapSchema = z
	.strictObject({ branches: z.array(branchSchema).min(1) })
	.superRefine((parsed, ctx) => {
		for (const problem of crossReferenceProblems(parsed.branches)) {
			ctx.addIssue({ code: 'custom', message: problem });
		}
	});

export type RoadmapItem = z.output<typeof leafSchema>;
export type RoadmapTwig = z.output<typeof twigSchema>;
export type RoadmapBranch = z.output<typeof branchSchema>;
export type Roadmap = z.output<typeof roadmapSchema>;

/** An item anywhere in the tree, with where it hangs. */
export type PlacedItem = {
	item: RoadmapItem | RoadmapTwig;
	branch: RoadmapBranch;
	/** The leaf a twig hangs off; absent for a leaf. */
	parent?: RoadmapItem;
};

function flatten(branches: RoadmapBranch[]): PlacedItem[] {
	return branches.flatMap((branch) =>
		branch.items.flatMap((item): PlacedItem[] => [
			{ item, branch },
			...(item.children ?? []).map((child) => ({ item: child, branch, parent: item }))
		])
	);
}

/**
 * The rules one item cannot check on its own. Exported for the tests, which
 * feed it hand-made broken trees.
 */
export function crossReferenceProblems(branches: RoadmapBranch[]): string[] {
	const problems: string[] = [];
	const placed = flatten(branches);

	// Branch ids share the namespace: they are fragments too.
	const seen = new Set<string>();
	for (const itemId of [...branches.map((branch) => branch.id), ...placed.map((p) => p.item.id)]) {
		if (seen.has(itemId)) {
			problems.push(`duplicate id "${itemId}"`);
		}
		seen.add(itemId);
	}

	// Every item is a link on /roadmap named by its title, and two links on
	// one page must not share an accessible name (see AGENTS.md).
	const titles = new Set<string>();
	for (const title of [
		...branches.map((branch) => branch.title),
		...placed.map((p) => p.item.title)
	]) {
		if (titles.has(title)) {
			problems.push(`duplicate title "${title}"`);
		}
		titles.add(title);
	}

	const byId = new Map(placed.map((p) => [p.item.id, p.item]));
	for (const { item } of placed) {
		if (item.status === 'shipped' && !item.shippedOn) {
			problems.push(`"${item.id}" is shipped but has no shippedOn date`);
		}
		if (item.status !== 'shipped' && item.shippedOn) {
			problems.push(`"${item.id}" has a shippedOn date but is ${item.status}`);
		}
		// "Coming up" on the landing page is for things that have not arrived.
		if (item.status === 'shipped' && item.featured) {
			problems.push(`"${item.id}" is featured but already shipped`);
		}
		for (const dependency of item.dependsOn ?? []) {
			if (!byId.has(dependency)) {
				problems.push(`"${item.id}" depends on unknown id "${dependency}"`);
			}
		}
	}

	// A cycle would make the details drawer's Needs/Leads to trail loop
	// forever for anyone following it.
	const state = new Map<string, 'visiting' | 'done'>();
	const visit = (itemId: string, path: string[]): void => {
		if (state.get(itemId) === 'done') {
			return;
		}
		if (state.get(itemId) === 'visiting') {
			problems.push(`dependency cycle: ${[...path, itemId].join(' → ')}`);
			return;
		}
		state.set(itemId, 'visiting');
		for (const dependency of byId.get(itemId)?.dependsOn ?? []) {
			visit(dependency, [...path, itemId]);
		}
		state.set(itemId, 'done');
	};
	for (const itemId of byId.keys()) {
		visit(itemId, []);
	}

	return problems;
}

export const roadmap: Roadmap = roadmapSchema.parse(data);

const placedItems = flatten(roadmap.branches);
const placedById = new Map(placedItems.map((p) => [p.item.id, p]));

/** Every leaf and twig, in file order. */
export function allItems(): PlacedItem[] {
	return placedItems;
}

export function findItem(itemId: string): PlacedItem | undefined {
	return placedById.get(itemId);
}

/** The items that list `itemId` in their `dependsOn` — what it leads to. */
export function dependents(itemId: string): PlacedItem[] {
	return placedItems.filter((p) => p.item.dependsOn?.includes(itemId));
}

/** Featured items that have not shipped, in file order: the landing page's "Coming up". */
export function featuredUpcoming(limit: number): PlacedItem[] {
	return placedItems.filter((p) => p.item.featured && p.item.status !== 'shipped').slice(0, limit);
}

/** The most recently shipped items, newest first (ties broken by id, so the order is stable). */
export function recentlyShipped(limit: number): PlacedItem[] {
	return placedItems
		.filter((p) => p.item.status === 'shipped')
		.toSorted(
			(a, b) =>
				(b.item.shippedOn ?? '').localeCompare(a.item.shippedOn ?? '') ||
				a.item.id.localeCompare(b.item.id)
		)
		.slice(0, limit);
}

export function statusCounts(): Record<RoadmapStatus, number> {
	const counts: Record<RoadmapStatus, number> = {
		shipped: 0,
		'in-progress': 0,
		planned: 0,
		exploring: 0
	};
	for (const { item } of placedItems) {
		counts[item.status] += 1;
	}
	return counts;
}

/**
 * "September 2026" from a `YYYY-MM-DD` date. Formatted in UTC so the server
 * and the browser agree on the month whatever their time zones — a date-only
 * string parses as UTC midnight, which is the previous day west of Greenwich.
 */
export function formatShippedOn(date: string): string {
	return new Date(date).toLocaleDateString('en-AU', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
}
