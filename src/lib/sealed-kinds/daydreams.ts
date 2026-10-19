/**
 * The sealed kinds behind Daydreams: a daydream's setup, each turn of its
 * story, the marks on its turns (bookmarks and reactions), and the user's
 * library of characters and scenes. All sealed in the writer's own vault. See
 * `../sealed.ts` for what a kind is and the rules every version follows, and
 * docs/daydreams.md for what the server sees beside them, and the moments it
 * sees more.
 *
 * Turns are plain text rather than rich-text documents: a reply is written by
 * a language model, which writes prose, and the user's side is flattened to
 * text before it is sent to one anyway.
 */

import { z } from 'zod';
import {
	castingProblem,
	DAYDREAM_LIMITS,
	type DaydreamSetup,
	DEFAULT_STORY_DIALS,
	MAX_DAYDREAM_CHARACTERS,
	MAX_DIRECTIONS,
	MAX_SUGGESTIONS,
	UNSET_CHARACTER_DIALS,
	UNSET_SCENE_DIALS,
	voiceProblem
} from '../daydream';
import { coversEveryFace, MAX_SIDES, MIN_SIDES } from '../daydream/dice';
import { defineSealedKind } from '../sealed';
import { isClientId } from '../vault';

const required = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => z.string().trim().max(max);
const clientId = z.string().refine(isClientId, 'Malformed id');
const dial = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

// ── characters and scenes ────────────────────────────────────────────────────

const characterDialsSchema = z.object({
	tone: z.enum(['warm', 'teasing', 'cold', 'clinical']).nullable(),
	control: dial.nullable(),
	strictness: dial.nullable(),
	edge: dial.nullable(),
	talk: dial.nullable(),
	libido: dial.nullable(),
	kink: dial.nullable()
});

const sceneDialsSchema = z.object({ heat: dial.nullable(), kink: dial.nullable() });

const characterShape = {
	name: required(DAYDREAM_LIMITS.characterName),
	archetype: optional(DAYDREAM_LIMITS.archetype),
	personality: optional(DAYDREAM_LIMITS.personality),
	speech: optional(DAYDREAM_LIMITS.speech),
	appearance: optional(DAYDREAM_LIMITS.appearance),
	likes: optional(DAYDREAM_LIMITS.likes),
	notes: optional(DAYDREAM_LIMITS.characterNotes),
	dials: characterDialsSchema
};

const partSchema = z.object({
	id: clientId,
	name: required(DAYDREAM_LIMITS.partName),
	description: optional(DAYDREAM_LIMITS.partDescription)
});

const sceneShape = {
	title: required(DAYDREAM_LIMITS.title),
	setting: optional(DAYDREAM_LIMITS.setting),
	premise: required(DAYDREAM_LIMITS.premise),
	yourRole: optional(DAYDREAM_LIMITS.yourRole),
	tone: optional(DAYDREAM_LIMITS.tone),
	notes: optional(DAYDREAM_LIMITS.sceneNotes),
	parts: z
		.array(partSchema)
		.max(MAX_DAYDREAM_CHARACTERS)
		.refine(
			(parts) => new Set(parts.map((part) => part.id)).size === parts.length,
			'Duplicate part'
		),
	dials: sceneDialsSchema
};

/** Who a character is in one daydream (`DaydreamCasting`). Only ever in a setup, never the library. */
const castingSchema = z.object({
	partId: clientId.nullable(),
	relationship: optional(DAYDREAM_LIMITS.relationship),
	part: optional(DAYDREAM_LIMITS.castPart)
});

/** Where a daydream's copy came from (`CopySource` in `../daydream.ts`). */
const sourceShape = {
	sourceId: clientId.nullable(),
	sourceRevision: z.number().int().min(0).nullable()
};

export const daydreamCharacterKind = defineSealedKind({
	name: 'daydream-character',
	maxCiphertextLength: 16 * 1024,
	versions: [{ version: 1, schema: z.object(characterShape) }]
});

export type DaydreamCharacterContent = z.output<typeof daydreamCharacterKind.latest>;

export const daydreamSceneKind = defineSealedKind({
	name: 'daydream-scene',
	maxCiphertextLength: 16 * 1024,
	versions: [{ version: 1, schema: z.object(sceneShape) }]
});

export type DaydreamSceneContent = z.output<typeof daydreamSceneKind.latest>;

// ── setup ────────────────────────────────────────────────────────────────────

const setupV1 = z.object({
	title: required(DAYDREAM_LIMITS.title),
	characterName: required(DAYDREAM_LIMITS.characterName),
	persona: optional(2000),
	lead: z.enum(['character', 'me', 'shared']),
	scenario: required(2000),
	tone: optional(DAYDREAM_LIMITS.tone),
	limits: optional(DAYDREAM_LIMITS.limits),
	safeword: optional(40)
});

const setupV2 = z
	.object({
		// Empty until the model names it after the opening (docs/daydreams.md).
		title: optional(DAYDREAM_LIMITS.title),
		voice: z.object({
			narrator: z.enum(['none', 'second-person', 'third-person', 'impersonal']),
			stance: z.enum(['self', 'persona', 'absent']),
			protagonistName: optional(DAYDREAM_LIMITS.protagonistName)
		}),
		characters: z
			.array(z.object({ ...characterShape, ...sourceShape, casting: castingSchema }))
			.max(MAX_DAYDREAM_CHARACTERS),
		scene: z.object({ ...sceneShape, ...sourceShape }),
		lead: z.enum(['character', 'me', 'shared']),
		limits: optional(DAYDREAM_LIMITS.limits),
		dials: z.object({
			intensity: dial,
			pace: dial,
			length: z.enum(['short', 'medium', 'long'])
		})
	})
	// The same rules the form shows (`voiceProblem`, `castingProblem`), so a
	// setup that makes no sense — a watcher with nothing to watch, a part
	// played twice — cannot be stored either.
	.superRefine((value, ctx) => {
		const problem = voiceProblem(value.voice, value.characters.length);
		if (problem) {
			ctx.addIssue({ code: 'custom', path: ['voice'], message: problem });
		}
		const miscast = castingProblem(value.characters, value.scene.parts);
		if (miscast) {
			ctx.addIssue({ code: 'custom', path: ['characters'], message: miscast });
		}
	});

export const daydreamSetupKind = defineSealedKind({
	name: 'daydream-setup',
	// Four characters with every field at its cap, a scene likewise, JSON-escaped,
	// sealed and base64url'd, fit inside.
	maxCiphertextLength: 96 * 1024,
	versions: [
		{
			version: 1,
			schema: setupV1,
			/**
			 * One character, speaking for themselves, to the user as themselves:
			 * what every v1 daydream was. The custom safeword is dropped on
			 * purpose — the Stop the scene control replaces typed safewords
			 * (docs/daydreams.md, "Safety").
			 */
			upcast: (value: z.output<typeof setupV1>): DaydreamSetup => ({
				title: value.title,
				voice: { narrator: 'none', stance: 'self', protagonistName: '' },
				characters: [
					{
						sourceId: null,
						sourceRevision: null,
						name: value.characterName,
						archetype: '',
						personality: value.persona,
						speech: '',
						appearance: '',
						likes: '',
						notes: '',
						dials: UNSET_CHARACTER_DIALS,
						casting: { partId: null, relationship: '', part: '' }
					}
				],
				scene: {
					sourceId: null,
					sourceRevision: null,
					title: value.title,
					setting: '',
					premise: value.scenario,
					yourRole: '',
					tone: value.tone,
					notes: '',
					parts: [],
					dials: UNSET_SCENE_DIALS
				},
				lead: value.lead,
				limits: value.limits,
				dials: DEFAULT_STORY_DIALS
			})
		},
		{ version: 2, schema: setupV2 }
	]
});

export type DaydreamSetupContent = z.output<typeof daydreamSetupKind.latest>;

// ── turns ────────────────────────────────────────────────────────────────────

/** A stretch of a passage's text, by offset. Turns never change once written, so offsets stay true. */
export const quoteSchema = z
	.object({
		start: z.number().int().min(0),
		end: z.number().int().min(1),
		text: z.string().min(1).max(DAYDREAM_LIMITS.quote)
	})
	.refine((quote) => quote.end > quote.start, 'A quote ends after it starts');

export type Quote = z.output<typeof quoteSchema>;

/** A direction button. The id is the model's own short name for it, so it can remove it later. */
export const directionSchema = z.object({
	id: z.string().regex(/^[a-z0-9-]{1,40}$/),
	label: z.string().trim().min(1).max(DAYDREAM_LIMITS.directionLabel)
});

export type Direction = z.output<typeof directionSchema>;

export const rollProposalSchema = z
	.object({
		prompt: z.string().trim().min(1).max(DAYDREAM_LIMITS.rollPrompt),
		sides: z.number().int().min(MIN_SIDES).max(MAX_SIDES),
		outcomes: z
			.array(
				z.object({
					min: z.number().int(),
					max: z.number().int(),
					label: z.string().trim().min(1).max(DAYDREAM_LIMITS.rollOutcome)
				})
			)
			.min(1)
			.max(MAX_SIDES)
	})
	.refine(coversEveryFace, 'Every face must land on exactly one outcome');

/** A passage's meta as turn v2 stored it. Frozen with v2: see `passageMetaSchema` for the current one. */
const passageMetaV2 = z.object({
	suggestions: z
		.array(z.string().trim().min(1).max(DAYDREAM_LIMITS.suggestion))
		.max(MAX_SUGGESTIONS)
		.default([]),
	directions: z
		.object({
			add: z.array(directionSchema).max(MAX_DIRECTIONS).default([]),
			remove: z
				.array(z.string().max(40))
				.max(MAX_DIRECTIONS * 2)
				.default([])
		})
		.default({ add: [], remove: [] }),
	roll: rollProposalSchema.optional(),
	readAs: z.enum(['action', 'direction', 'cowrite', 'ooc']).optional(),
	ooc: z.boolean().optional(),
	rewriteOf: z
		.object({
			turnId: clientId,
			quote: quoteSchema.optional(),
			instruction: z.string().trim().max(DAYDREAM_LIMITS.instruction).optional()
		})
		.optional()
});

/**
 * How a turn the user wrote is meant: something they do or say, an
 * instruction for their own turn to be written out, a direction for where the
 * story goes, the next part of the story co-written, or out of character.
 */
export const readingSchema = z.enum(['action', 'instruction', 'direction', 'cowrite', 'ooc']);

export type Reading = z.output<typeof readingSchema>;

/**
 * What the model says about a passage besides the passage: the buttons and
 * suggestions it offers next, a roll if it proposes one, how it read the
 * user's turn, and whether it stepped out of the story. Only ever on a story
 * turn. Never sent back to the model with past turns (`daydream/context.ts`):
 * it is for the screen, and would cost context for nothing — except
 * `expansion`, which is the user's own turn rather than the passage's.
 *
 * `expansion` is the user's turn written out in full, when they wrote what
 * their turn should be ("Tell Charlie the fox is safe") rather than the turn
 * itself, and the model wrote it out before answering it (readAs
 * `instruction`). It lives here, on the passage that answered it, because
 * turns never change once written: the user's own turn keeps what they sent.
 */
export const passageMetaSchema = passageMetaV2.extend({
	readAs: readingSchema.optional(),
	expansion: z.string().trim().min(1).max(DAYDREAM_LIMITS.turn).optional(),
	/**
	 * The user picked `readAs` themselves (Read as…), overriding the model's
	 * reading: this passage was written with it forced, and later requests
	 * keep telling the model so (`daydream/context.ts`).
	 */
	readAsChosen: z.boolean().optional()
});

export type PassageMeta = z.output<typeof passageMetaSchema>;

const turnV1 = z.object({ text: z.string().min(1).max(DAYDREAM_LIMITS.turn) });

/** The turn types besides text, which have not changed since v2. */
const turnTypesV2 = [
	// A direction button pressed. Continue is not one: it adds no turn.
	z.object({
		type: z.literal('direction'),
		id: z.string().max(40),
		label: directionSchema.shape.label
	}),
	// Something in a passage selected and acted on.
	z.object({
		type: z.literal('steer'),
		action: z.enum(['more', 'rewrite', 'not-this']),
		targetTurnId: clientId,
		quote: quoteSchema
	}),
	// Stop the scene, ease off, or carry on after stopping.
	z.object({ type: z.literal('safety'), signal: z.enum(['red', 'yellow', 'resume']) }),
	// A die rolled for the roll a passage proposed.
	z.object({
		type: z.literal('roll'),
		proposalTurnId: clientId,
		sides: z.number().int().min(MIN_SIDES).max(MAX_SIDES),
		result: z.number().int().min(1).max(MAX_SIDES),
		outcome: z.string().trim().min(1).max(DAYDREAM_LIMITS.rollOutcome)
	})
] as const;

/** Prose, from either side; the row's `role` says whose. */
const textTurn = <Meta extends z.ZodType>(meta: Meta) =>
	z.object({
		type: z.literal('text'),
		// Not trimmed: a reply's own spacing is part of it, and a turn is stored
		// exactly as shown.
		text: z.string().min(1).max(DAYDREAM_LIMITS.turn),
		meta: meta.optional()
	});

const turnV2 = z.discriminatedUnion('type', [textTurn(passageMetaV2), ...turnTypesV2]);

// v3: a passage may carry the user's turn written out (`expansion`), read it
// as an `instruction`, and say the reading was the user's choice.
const turnV3 = z.discriminatedUnion('type', [textTurn(passageMetaSchema), ...turnTypesV2]);

// v4: a passage may carry the model's reply exactly as it arrived (`raw`),
// tags, metadata and all, for debug mode's raw log (docs/debug-mode.md). Only
// written for an account granted debug mode, and only ever displayed: what
// the page acts on is still the parsed `text` and `meta`.
const turnV4 = z.discriminatedUnion('type', [
	textTurn(passageMetaSchema).extend({
		raw: z.string().min(1).max(DAYDREAM_LIMITS.rawReply).optional(),
		/** The reply ran past `rawReply` and `raw` is its start. */
		rawTruncated: z.literal(true).optional()
	}),
	...turnTypesV2
]);

// v5: a passage may carry what its request actually sent the model (`sent`,
// `daydream/sent-record.ts`): the system prompt, what the request added after
// the last passage, and the history as a hash chain. For debug mode's raw
// log, alongside `raw`, and written under the same rule.
const sentRecordSchema = z.object({
	system: z.string().max(DAYDREAM_LIMITS.sentSystem),
	added: z
		.array(z.string().max(DAYDREAM_LIMITS.sentAdded))
		.max(8)
		.refine(
			(added) =>
				added.reduce((sum, content) => sum + content.length, 0) <= DAYDREAM_LIMITS.sentAdded,
			'Too much was added to keep'
		),
	history: z.object({
		messages: z.number().int().min(0),
		chain: z.string().regex(/^[0-9a-f]{64}$/)
	}),
	truncated: z.literal(true).optional()
});

const turnV5 = z.discriminatedUnion('type', [
	textTurn(passageMetaSchema).extend({
		raw: z.string().min(1).max(DAYDREAM_LIMITS.rawReply).optional(),
		rawTruncated: z.literal(true).optional(),
		sent: sentRecordSchema.optional()
	}),
	...turnTypesV2
]);

export const daydreamTurnKind = defineSealedKind({
	name: 'daydream-turn',
	// Raised from 48 KB with v4, whose `raw` repeats the passage and the
	// written-out turn alongside the metadata. No higher than the most a
	// daydream endpoint takes (`sealedFields` in schemas/daydreamForm.ts).
	maxCiphertextLength: 96 * 1024,
	versions: [
		{
			version: 1,
			schema: turnV1,
			upcast: (value: z.output<typeof turnV1>) => ({ type: 'text', text: value.text })
		},
		{
			version: 2,
			schema: turnV2,
			// Everything v2 could say, v3 says the same way.
			upcast: (value: z.output<typeof turnV2>) => value
		},
		{
			version: 3,
			schema: turnV3,
			// Everything v3 could say, v4 says the same way.
			upcast: (value: z.output<typeof turnV3>) => value
		},
		{
			version: 4,
			schema: turnV4,
			// Everything v4 could say, v5 says the same way.
			upcast: (value: z.output<typeof turnV4>) => value
		},
		{ version: 5, schema: turnV5 }
	]
});

export type DaydreamTurnContent = z.output<typeof daydreamTurnKind.latest>;

// ── marks ────────────────────────────────────────────────────────────────────

const bookmarkMark = z.object({
	type: z.literal('bookmark'),
	label: optional(DAYDREAM_LIMITS.bookmarkLabel),
	quote: quoteSchema.nullable()
});

const markV1 = z.discriminatedUnion('type', [
	// A save point, or a highlighted quote when `quote` is set.
	bookmarkMark,
	z.object({
		type: z.literal('reaction'),
		reaction: z.enum(['love', 'like', 'not-for-me'])
	})
]);

// v2: a reaction says where in the story it was made — the turn that was
// newest then (`after`) — so it goes to the model there, as a note added to
// the story rather than one put back beside its passage, which would change a
// history every later request had already sent (docs/daydreams.md, "Cost").
const markV2 = z.discriminatedUnion('type', [
	bookmarkMark,
	z.object({
		type: z.literal('reaction'),
		reaction: z.enum(['love', 'like', 'not-for-me']),
		after: clientId.optional()
	})
]);

export const daydreamMarkKind = defineSealedKind({
	name: 'daydream-mark',
	maxCiphertextLength: 4 * 1024,
	versions: [
		{
			version: 1,
			schema: markV1,
			// A reaction from before v2 says nothing of where it was made, and
			// goes back beside its passage, as it always did.
			upcast: (value: z.output<typeof markV1>) => value
		},
		{ version: 2, schema: markV2 }
	]
});

export type DaydreamMarkContent = z.output<typeof daydreamMarkKind.latest>;
