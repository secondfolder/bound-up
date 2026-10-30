/**
 * The sealed kinds behind the new daydream engine (docs/dreams.md,
 * "Storage"): a daydream's setup, each turn of its story, the detail filled
 * in on tap, scene summaries, and the user's own preferences. All sealed in
 * the writer's own vault. See `../sealed.ts` for what a kind is and the rules
 * every version follows.
 *
 * Independent of the old Daydreams' kinds (`./daydreams.ts`): the engine is
 * built beside the old one rather than on it, so nothing here upcasts from
 * there.
 */

import { z } from 'zod';
import { HEAT_LEVELS, MAX_TELLING_CHARS, THEMES, VIEWS } from '../dream/build';
import { CAPABILITIES } from '../dream/capabilities';
import { blockDesignSchema, MAX_DESIGNS } from '../dream/designs';
import { MAX_ELEMENT_CHARS, MAX_ELEMENTS } from '../dream/elements';
import { MAX_DIRECTIONS } from '../dream/reading';
import { READINGS } from '../dream/readings';
import { defineSealedKind } from '../sealed';
import { isClientId } from '../vault';

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
/** The ids the model gives elements and markers: a slug, never free text. */
const slug = z.string().regex(/^[\w-]{1,40}$/);

/** The longest brief, and the longest change asked for while it is set up. */
export const MAX_BRIEF_CHARS = 2000;
export const MAX_AMENDMENT_CHARS = 500;
export const MAX_AMENDMENTS = 12;
/** A passage's source, markup and footer included. */
export const MAX_PASSAGE_CHARS = 24_000;
/** What the user writes in one turn. */
export const MAX_INPUT_CHARS = 4000;
export const MAX_PREFERENCE_CHARS = 200;
export const MAX_PREFERENCES = 120;
export const MAX_SUMMARY_CHARS = 2000;

// ── preferences ─────────────────────────────────────────────────────────────

/**
 * One preference (docs/dreams.md, "Preferences"). Hard limits are the `hard`
 * ones: in the core of every prompt, never dropped. `appliesTo` limits a
 * general one to a kind of brief ("training stories"); empty applies to all.
 */
export const dreamPreferenceSchema = z.object({
	id: required(40),
	text: required(MAX_PREFERENCE_CHARS),
	firmness: z.enum(['hard', 'default', 'leaning']),
	appliesTo: text(120),
	source: z.enum(['typed', 'answer', 'noticed', 'amendment'])
});

export type DreamPreference = z.output<typeof dreamPreferenceSchema>;

// ── elements ────────────────────────────────────────────────────────────────

const statSchema = z.object({
	name: required(60),
	kind: z.enum(['meter', 'count', 'list', 'line']),
	value: z.union([z.number(), text(400), z.array(text(200)).max(20)]),
	max: z.number().optional(),
	description: text(400)
});

const fieldSchema = z.object({
	name: required(40),
	text: text(MAX_ELEMENT_CHARS),
	shown: z.boolean()
});

/** `DreamElement` as stored (`../dream/elements.ts`). */
export const dreamElementSchema = z.object({
	id: slug,
	type: required(40),
	name: required(80),
	/** Added before any build that writes it was deployed, so in place (sealed-fixtures/README.md). */
	short: required(40).optional(),
	also: z.array(required(80)).max(12),
	shown: z.boolean(),
	nameFrom: text(400).optional(),
	fields: z.array(fieldSchema).max(24),
	stats: z.array(statSchema).max(12)
});

// ── the setup ───────────────────────────────────────────────────────────────

const directionSchema = z.object({
	id: required(8),
	p: z.number().min(0).max(1),
	text: required(1000)
});

const questionSchema = z.object({
	id: required(40),
	text: required(400),
	options: z.array(required(200)).max(8),
	keep: z.enum(['story', 'general'])
});

/** A page read or a search made while the brief was read (`Lookup` in the browser). */
const lookupSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('fetch'),
		url: z.string().max(2000),
		ok: z.boolean(),
		allowed: z.boolean()
	}),
	z.object({ type: z.literal('search'), query: z.string().max(400), ok: z.boolean() })
]);

/** At most this many steps are kept in a setup's trail; the oldest go first. */
export const MAX_TRAIL = 40;

/** One step a setup was made by: a request to the model, a pick, or an answer. */
const trailStepSchema = z.object({
	id: required(40),
	kind: z.enum(['research', 'read', 'answer', 'pick', 'build']),
	/** Pages read and searches made during this request. */
	lookups: z.array(lookupSchema).max(24).optional(),
	/** For a pick: whether code or the user chose. */
	by: z.enum(['code', 'user']).optional()
});

export type DreamTrailStep = z.output<typeof trailStepSchema>;

/** Step 1's reading of the brief (`BriefReading`, without the build it may carry). */
const readingSchema = z.object({
	musts: z.array(required(400)).max(20),
	research: z.object({ needed: z.boolean(), text: text(2000) }),
	spread: z.object({ n: z.number().int().min(1).max(MAX_DIRECTIONS), reason: text(400) }),
	directions: z.array(directionSchema).max(MAX_DIRECTIONS),
	pick: z.object({ by: z.enum(['code', 'user']), reason: text(400) }),
	ask: questionSchema.nullable(),
	/** The answer to `ask`, when it was answered. */
	answer: text(400).nullable(),
	/**
	 * What was looked up to read it, so the setup page still shows it after a
	 * reload. Added in place before the engine was deployed
	 * (sealed-fixtures/README.md).
	 */
	lookups: z.array(lookupSchema).max(24).optional()
});

/** Which direction was taken, by whom, and code's draws that went with it. */
const chosenSchema = z.object({
	directionId: required(8),
	by: z.enum(['code', 'user']),
	nudges: z.array(z.object({ dimension: required(40), text: required(200) })).max(6),
	seed: z.number().int()
});

const buildSchema = z.object({
	title: required(120),
	heat: z.enum(HEAT_LEVELS),
	telling: text(MAX_TELLING_CHARS),
	presentation: z.object({
		view: z.enum(VIEWS),
		theme: z.enum(THEMES),
		notes: text(400)
	}),
	capabilities: z.array(z.enum(CAPABILITIES)),
	elements: z.array(dreamElementSchema).max(MAX_ELEMENTS)
});

/**
 * Everything a daydream is set up from and as: the brief and the changes
 * asked for while it was set up, step 1's reading, the direction taken, the
 * build, and this story's own preferences. Saved after each finished step,
 * so a reload carries on from there (docs/dreams.md, "The setup page").
 */
export const dreamSetupKind = defineSealedKind({
	name: 'dream-setup',
	maxCiphertextLength: 128 * 1024,
	versions: [
		{
			version: 1,
			schema: z.object({
				brief: required(MAX_BRIEF_CHARS),
				amendments: z.array(required(MAX_AMENDMENT_CHARS)).max(MAX_AMENDMENTS),
				reading: readingSchema.nullable(),
				chosen: chosenSchema.nullable(),
				build: buildSchema.nullable(),
				preferences: z.array(dreamPreferenceSchema).max(MAX_PREFERENCES),
				/**
				 * Built, and waiting on the user's Start (docs/dreams.md, "The
				 * setup page"). Absent is started: daydreams from before it had
				 * none. Added in place before the engine was deployed
				 * (sealed-fixtures/README.md).
				 */
				awaitingStart: z.boolean().optional(),
				/**
				 * Elements changed by hand since the build, worded, waiting on
				 * Update to have the build follow them (docs/dreams.md, "Changing
				 * what was made"). Added in place before the engine was deployed.
				 */
				pendingEdits: z.array(required(400)).max(24).optional(),
				/**
				 * Each pending edit's element as it was before it, by position,
				 * so an edit can be undone. Added in place before the engine was
				 * deployed.
				 */
				editedFrom: z.array(dreamElementSchema).max(24).optional(),
				/**
				 * Blocks designed for this daydream (docs/dreams.md, "Designed
				 * blocks"), offered to the story model by kind from then on.
				 * Added in place before the engine was deployed.
				 */
				designs: z.array(blockDesignSchema).max(MAX_DESIGNS).optional(),
				/**
				 * The steps it has been set up by, in the order they were taken
				 * (docs/dreams.md, "The setup page"): each request to the model
				 * and what it looked up, each pick and answer. Added in place
				 * before the engine was deployed.
				 */
				trail: z.array(trailStepSchema).max(MAX_TRAIL).optional()
			})
		}
	]
});

export type DreamSetup = z.output<typeof dreamSetupKind.latest>;
export type DreamSetupBuild = z.output<typeof buildSchema>;
export type DreamSetupReading = z.output<typeof readingSchema>;

// ── turns ───────────────────────────────────────────────────────────────────

/**
 * What asked for a passage: the opening, the next after the user's turn,
 * carrying on with no turn (`continue`), the same events in new words
 * (`take`), or the user's own rewrite (`edit`).
 */
export const PASSAGE_REQUESTS = ['opening', 'next', 'continue', 'take', 'edit'] as const;
export type PassageRequest = (typeof PASSAGE_REQUESTS)[number];

const passageSchema = z.object({
	kind: z.literal('passage'),
	/** The passage as written: markup, and the `<after>` footer. */
	source: z.string().max(MAX_PASSAGE_CHARS),
	request: z.enum(PASSAGE_REQUESTS),
	/** How it ended: `stopped` short of its end, `refused`, or `failed` part way. */
	ended: z.enum(['complete', 'stopped', 'refused', 'failed']),
	/** Which model and provider wrote it, for "Behind the scenes"; empty for an edit. */
	model: text(120),
	provider: text(120),
	/**
	 * How the user chose to have the turn before it read ("Read it
	 * differently"), kept and sent with that turn from then on. Added in
	 * place before the engine was deployed (sealed-fixtures/README.md).
	 */
	readAs: z.enum(READINGS).optional(),
	/**
	 * Its tokens and cost, and how much of its prompt the provider's cache
	 * served, for debug mode (docs/dreams.md, "Debug mode"). Added in place
	 * before the engine was deployed.
	 */
	usage: z
		.object({
			promptTokens: z.number().int().min(0),
			cachedTokens: z.number().int().min(0),
			completionTokens: z.number().int().min(0),
			cost: z.number().nullable(),
			latencyMs: z.number().int().min(0).optional()
		})
		.optional()
});

/**
 * The user's turn. Its parts are each a turn type (docs/dreams.md,
 * "Playing"): words, the settings of cycling choices, answers, a roll, and
 * what was filled into a block's fields. Each is stored, so a reload or a
 * branch replays it exactly.
 */
const inputSchema = z.object({
	kind: z.literal('input'),
	text: text(MAX_INPUT_CHARS),
	cycles: z.array(z.object({ id: slug, value: required(200) })).max(20),
	answers: z.array(z.object({ id: slug, text: required(400), remember: z.boolean() })).max(8),
	rolls: z.array(z.object({ id: slug, sides: z.number().int(), value: z.number().int() })).max(4),
	fields: z.array(z.object({ block: slug, name: required(60), value: text(1000) })).max(30)
});

export const dreamTurnKind = defineSealedKind({
	name: 'dream-turn',
	maxCiphertextLength: 48 * 1024,
	versions: [{ version: 1, schema: z.discriminatedUnion('kind', [passageSchema, inputSchema]) }]
});

export type DreamTurn = z.output<typeof dreamTurnKind.latest>;
export type DreamPassageTurn = Extract<DreamTurn, { kind: 'passage' }>;
export type DreamInputTurn = Extract<DreamTurn, { kind: 'input' }>;

// ── detail ──────────────────────────────────────────────────────────────────

/**
 * Detail filled in after a passage, valid from that turn on along its branch
 * (docs/dreams.md, "Detail on tap"): an element as it now stands (a card
 * filled in on tap, or facts added after a passage), or the sentences a
 * `<more>` expanded into. The latest along the branch wins.
 */
const elementDetail = z.object({ kind: z.literal('element'), element: dreamElementSchema });
const moreDetail = z.object({ kind: z.literal('more'), key: required(80), text: required(1200) });

/** What opens a stored picture: one age key per picture, never sent to the server. */
const AGE_SECRET_KEY = /^AGE-SECRET-KEY-1[0-9A-Z]{58}$/;

export const dreamDetailKind = defineSealedKind({
	name: 'dream-detail',
	maxCiphertextLength: 16 * 1024,
	versions: [
		{
			version: 1,
			schema: z.discriminatedUnion('kind', [elementDetail, moreDetail]),
			// Version 2 only adds a kind of detail.
			upcast: (value: unknown) => value
		},
		{
			version: 2,
			schema: z.discriminatedUnion('kind', [
				elementDetail,
				moreDetail,
				/**
				 * A `<picture>` drawn on tap (docs/dreams.md, "Pictures"): which
				 * marker, where the encrypted picture is stored, and the key that
				 * opens it.
				 */
				z.object({
					kind: z.literal('picture'),
					key: required(80),
					pictureId: z.string().refine(isClientId, 'Malformed id'),
					fileKey: z.string().regex(AGE_SECRET_KEY)
				})
			])
		}
	]
});

export type DreamDetail = z.output<typeof dreamDetailKind.latest>;

// ── summaries ───────────────────────────────────────────────────────────────

/**
 * A finished scene, condensed, stored against its last turn: older scenes go
 * to the model as these rather than word for word (docs/dreams.md, "Memory").
 * Only ever added, never rewritten.
 */
export const dreamSummaryKind = defineSealedKind({
	name: 'dream-summary',
	maxCiphertextLength: 8 * 1024,
	versions: [
		{
			version: 1,
			schema: z.object({
				text: required(MAX_SUMMARY_CHARS),
				/** The scene's first turn: the summary stands in for it through the turn it is stored on. */
				fromTurnId: required(40)
			})
		}
	]
});

export type DreamSummary = z.output<typeof dreamSummaryKind.latest>;

// ── preferences ─────────────────────────────────────────────────────────────

/** The user's own preferences, every daydream's: hard limits among them. */
export const dreamPreferencesKind = defineSealedKind({
	name: 'dream-preferences',
	maxCiphertextLength: 64 * 1024,
	versions: [
		{
			version: 1,
			schema: z.object({ preferences: z.array(dreamPreferenceSchema).max(MAX_PREFERENCES) })
		}
	]
});

export type DreamPreferences = z.output<typeof dreamPreferencesKind.latest>;
