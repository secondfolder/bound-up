import { z } from 'zod';
import { catalog } from '../kink-list/catalog';
import { SCENE_SECTIONS } from './blocks';
import data from './considerations.json' with { type: 'json' };

/**
 * The scene designer's prompts: things to think about, and questions with
 * answers to pick, shown in the column beside a scene. See docs/scenes.md.
 *
 * The content lives in `considerations.json` and is validated here when the
 * module loads, as the roadmap and the kink catalogue are, so a typo in a
 * kink id or a section fails the tests and the type check rather than
 * reaching anyone as a prompt that never shows. Alias-free and pure.
 */

/** The kinds of thing the column offers, each with its own Fewer and More. */
export const PROMPT_TYPES = ['blocks', 'think', 'ask', 'kinks', 'story'] as const;
export type PromptType = (typeof PROMPT_TYPES)[number];

export const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
	think: 'Things to think about',
	ask: 'Questions',
	kinks: 'What you’re into',
	blocks: 'Add a block',
	story: 'Story ideas'
};

/**
 * How many of a type to show, from 0 (hidden) to 5 (everything). A prompt
 * shows when its own `level` is at most this. New people start in the
 * middle: the essentials and a little more.
 */
export const MIN_PROMPT_LEVEL = 0;
export const MAX_PROMPT_LEVEL = 5;
export const DEFAULT_PROMPT_LEVEL = 2;

/**
 * The four questions negotiation keeps coming back to, plus what happens
 * before: what you want, what you don't, how you'll talk during, what
 * happens after.
 */
export const CONSIDERATION_GROUPS = ['want', 'avoid', 'before', 'during', 'after'] as const;
export type ConsiderationGroup = (typeof CONSIDERATION_GROUPS)[number];

export const GROUP_LABELS: Record<ConsiderationGroup, string> = {
	want: 'What you want',
	avoid: 'What you don’t',
	before: 'Before',
	during: 'During',
	after: 'After'
};

// Ids are stored in the scene (which prompts were handled) and in each
// person's preferences (which they never want to see), so they are kept
// simple and never reused.
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ids are kebab-case');

const whenSchema = z.strictObject({
	/** Shown when the page mentions any of these kinks, or a kink under one. */
	kinks: z.array(id).min(1).optional(),
	/** Shown when the page mentions a kink with any of these tags. */
	tags: z.array(z.string().min(1)).min(1).optional(),
	/** Shown when the page mentions a kink at least this intense. */
	minIntensity: z.number().int().min(0).max(6).optional()
});

const considerationSchema = z
	.strictObject({
		id,
		type: z.enum(['think', 'ask']),
		group: z.enum(CONSIDERATION_GROUPS),
		level: z.number().int().min(1).max(MAX_PROMPT_LEVEL),
		title: z.string().min(1).max(80),
		/** One line, warm and plain: why someone might want to think about it. */
		why: z.string().min(1).max(240),
		/** `ask` only: answers to tap. Someone can always write their own. */
		answers: z.array(z.string().min(1).max(60)).min(2).optional(),
		/** Absent: always relevant. Otherwise any one condition is enough. */
		when: whenSchema.optional(),
		/** What Add puts on the page. `{answer}` is the answer picked. */
		insert: z.strictObject({
			section: z.enum(SCENE_SECTIONS),
			text: z.string().min(1).max(200)
		})
	})
	.superRefine((entry, ctx) => {
		if (entry.type === 'ask' && !entry.answers) {
			ctx.addIssue({ code: 'custom', message: `"${entry.id}" asks but offers no answers` });
		}
		if (entry.type === 'think' && entry.answers) {
			ctx.addIssue({
				code: 'custom',
				message: `"${entry.id}" has answers but only asks a question`
			});
		}
		if (entry.type === 'ask' && !entry.insert.text.includes('{answer}')) {
			ctx.addIssue({ code: 'custom', message: `"${entry.id}" never uses the answer` });
		}
		if (entry.when && Object.keys(entry.when).length === 0) {
			ctx.addIssue({ code: 'custom', message: `"${entry.id}" has an empty "when"` });
		}
	});

export type Consideration = z.output<typeof considerationSchema>;

/**
 * The rules no single entry can check: unique ids, and every kink and tag a
 * `when` names being one the catalogue has. Exported for the tests, which
 * feed it broken lists.
 */
export function considerationProblems(entries: Consideration[]): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();
	const kinkIds = new Set(catalog.items.map((item) => item.id));
	const tags = new Set(Object.keys(catalog.tags));
	for (const entry of entries) {
		if (seen.has(entry.id)) {
			problems.push(`duplicate id "${entry.id}"`);
		}
		seen.add(entry.id);
		for (const kink of entry.when?.kinks ?? []) {
			if (!kinkIds.has(kink)) {
				problems.push(`"${entry.id}" names an unknown kink "${kink}"`);
			}
		}
		for (const tag of entry.when?.tags ?? []) {
			if (!tags.has(tag)) {
				problems.push(`"${entry.id}" names an unknown tag "${tag}"`);
			}
		}
	}
	return problems;
}

export const considerationsSchema = z
	.strictObject({ version: z.literal(1), considerations: z.array(considerationSchema).min(1) })
	.superRefine((parsed, ctx) => {
		for (const problem of considerationProblems(parsed.considerations)) {
			ctx.addIssue({ code: 'custom', message: problem });
		}
	});

export const considerations: readonly Consideration[] =
	considerationsSchema.parse(data).considerations;

/** What the page mentions, as `recognise` works it out. */
export type Mentioned = {
	/** Every kink named, and every kink above one in the catalogue. */
	kinkIds: ReadonlySet<string>;
	tags: ReadonlySet<string>;
	/** The highest intensity among the kinks named; -1 for none. */
	maxIntensity: number;
};

export const NOTHING_MENTIONED: Mentioned = {
	kinkIds: new Set(),
	tags: new Set(),
	maxIntensity: -1
};

/** Whether `entry` is relevant to a page that mentions `mentioned`. */
export function isRelevant(entry: Consideration, mentioned: Mentioned): boolean {
	const { when } = entry;
	if (!when) {
		return true;
	}
	return (
		(when.kinks?.some((kink) => mentioned.kinkIds.has(kink)) ?? false) ||
		(when.tags?.some((tag) => mentioned.tags.has(tag)) ?? false) ||
		(when.minIntensity !== undefined && mentioned.maxIntensity >= when.minIntensity)
	);
}

/** What has become of a prompt in one scene. */
export type PromptOutcome = 'added' | 'handled' | 'dismissed';

/**
 * The prompts of one type to show, in the order the catalogue gives them
 * (which follows the four questions). Prompts whose condition the page has
 * not met wait until it does; a prompt someone has dealt with, in this scene
 * or for good, goes.
 */
export function visibleConsiderations(
	type: 'think' | 'ask',
	options: {
		level: number;
		mentioned: Mentioned;
		/** This scene's outcomes, by prompt id. */
		outcomes: ReadonlyMap<string, PromptOutcome>;
		/** What this person never wants to see, in any scene. */
		neverShow: ReadonlySet<string>;
	}
): Consideration[] {
	return considerations.filter(
		(entry) =>
			entry.type === type &&
			entry.level <= options.level &&
			!options.outcomes.has(entry.id) &&
			!options.neverShow.has(entry.id) &&
			isRelevant(entry, options.mentioned)
	);
}

/** The text Add puts on the page for `entry`, with the answer picked, if any. */
export function insertText(entry: Consideration, answer?: string): string {
	return entry.insert.text.replace('{answer}', answer?.trim() ?? '');
}

/** One step more or fewer, kept inside the range. */
export function stepLevel(level: number, by: 1 | -1): number {
	return Math.min(MAX_PROMPT_LEVEL, Math.max(MIN_PROMPT_LEVEL, level + by));
}
