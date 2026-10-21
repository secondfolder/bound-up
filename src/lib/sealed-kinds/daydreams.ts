/**
 * The sealed kinds behind Daydreams: a daydream's setup, each turn of its
 * story, the marks on its turns (bookmarks and reactions), and the user's
 * library of characters and ideas. All sealed in the writer's own vault. See
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
	CHARACTER_FIELD_KINDS,
	castingProblem,
	DAYDREAM_LIMITS,
	type DaydreamVoice,
	DEFAULT_PICTURES,
	type FieldKind,
	fieldCap,
	fieldsFrom,
	IDEA_FIELD_KINDS,
	KNOWN_FIELD_IDS,
	MAX_DAYDREAM_CHARACTERS,
	MAX_DIRECTIONS,
	MAX_FIELD_LENGTH,
	MAX_FIELDS,
	MAX_OPENINGS,
	MAX_SUGGESTIONS,
	MAX_TRACKERS,
	TRACKER_KINDS,
	UNSET_CHARACTER_DIALS,
	UNSET_IDEA_DIALS,
	voiceProblem
} from '../daydream';
import { coversEveryFace, MAX_SIDES, MIN_SIDES } from '../daydream/dice';
import { EXCHANGE_LIMITS, MAX_EXCHANGE_CIPHERTEXT } from '../daydream/exchange';
import { MAX_PICTURE_REQUEST_PROMPT } from '../daydream/image-prompt';
import { defineSealedKind } from '../sealed';
import { isClientId } from '../vault';

const required = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => z.string().trim().max(max);
const clientId = z.string().refine(isClientId, 'Malformed id');
const dial = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

// ── characters and ideas ────────────────────────────────────────────────────

const characterDialsSchema = z.object({
	tone: z.enum(['warm', 'teasing', 'cold', 'clinical']).nullable(),
	control: dial.nullable(),
	strictness: dial.nullable(),
	edge: dial.nullable(),
	talk: dial.nullable(),
	libido: dial.nullable(),
	kink: dial.nullable()
});

const ideaDialsSchema = z.object({ heat: dial.nullable(), kink: dial.nullable() });

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

const ideaShape = {
	title: required(DAYDREAM_LIMITS.title),
	setting: optional(DAYDREAM_LIMITS.setting),
	premise: required(DAYDREAM_LIMITS.premise),
	yourRole: optional(DAYDREAM_LIMITS.yourRole),
	tone: optional(DAYDREAM_LIMITS.tone),
	notes: optional(DAYDREAM_LIMITS.ideaNotes),
	parts: z
		.array(partSchema)
		.max(MAX_DAYDREAM_CHARACTERS)
		.refine(
			(parts) => new Set(parts.map((part) => part.id)).size === parts.length,
			'Duplicate part'
		),
	dials: ideaDialsSchema
};

/**
 * v2 of an idea: the brief it was written from and the model's research
 * behind it (`DaydreamIdea.brief`, `.research`). A shape of its own, since
 * `ideaShape` is v1's and every setup version up to v4's, and a shipped
 * version's schema must never change under it.
 */
const ideaV2Shape = {
	...ideaShape,
	brief: optional(DAYDREAM_LIMITS.brief),
	research: optional(DAYDREAM_LIMITS.ideaResearch)
};

/** An idea from before v2 had no brief or research: it was written by hand, or they were not kept. */
const NO_ORIGIN = { brief: '', research: '' } as const;

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

/**
 * A field of a character or an idea (`DaydreamField`): a known kind, whose
 * label is the catalog's, or one the user named, which must have a name. A
 * record holds each known kind once, under its fixed id, and every id once.
 */
function fieldsSchema<Kind extends string>(
	kinds: readonly [Kind, ...Kind[]],
	of: 'character' | 'idea'
) {
	return z
		.array(
			z
				.object({
					id: clientId,
					kind: z.enum(kinds).nullable(),
					label: optional(DAYDREAM_LIMITS.fieldLabel),
					value: optional(MAX_FIELD_LENGTH),
					spoiler: z.boolean()
				})
				.superRefine((field, ctx) => {
					if (field.kind === null && field.label === '') {
						ctx.addIssue({ code: 'custom', path: ['label'], message: 'Name the field' });
					}
					if (field.value.length > fieldCap(field.kind as FieldKind | null, of)) {
						ctx.addIssue({ code: 'custom', path: ['value'], message: 'Too long' });
					}
					if (field.kind !== null && field.id !== KNOWN_FIELD_IDS[field.kind as FieldKind]) {
						ctx.addIssue({ code: 'custom', path: ['id'], message: 'Not the field’s own id' });
					}
				})
		)
		.max(MAX_FIELDS)
		.refine(
			(fields) => new Set(fields.map((field) => field.id)).size === fields.length,
			'Duplicate field'
		);
}

const characterFieldsSchema = fieldsSchema(CHARACTER_FIELD_KINDS, 'character');
const ideaFieldsSchema = fieldsSchema(IDEA_FIELD_KINDS, 'idea');

/**
 * v2 of a character: their type and appearance, and everything else as
 * fields (`DaydreamField`) rather than four fixed ones — the ones the user
 * names, and what they hide, won't do or are won over by.
 */
const characterV2Shape = {
	name: required(DAYDREAM_LIMITS.characterName),
	archetype: optional(DAYDREAM_LIMITS.archetype),
	appearance: optional(DAYDREAM_LIMITS.appearance),
	fields: characterFieldsSchema,
	dials: characterDialsSchema
};

type CharacterV1 = z.output<z.ZodObject<typeof characterShape>>;
type CharacterV2 = z.output<z.ZodObject<typeof characterV2Shape>>;

/** A v1 character's fixed fields, as v2's known fields: the empty ones dropped. */
function characterToV2<T extends CharacterV1>({
	personality,
	speech,
	likes,
	notes,
	...rest
}: T): Omit<T, 'personality' | 'speech' | 'likes' | 'notes'> & Pick<CharacterV2, 'fields'> {
	return {
		...rest,
		fields: fieldsFrom(['personality', 'speech', 'likes', 'notes'], {
			personality,
			speech,
			likes,
			notes
		})
	};
}

export const daydreamCharacterKind = defineSealedKind({
	name: 'daydream-character',
	// Every field at its cap: twelve fields at the longest a field may be.
	maxCiphertextLength: 48 * 1024,
	versions: [
		{
			version: 1,
			schema: z.object(characterShape),
			upcast: (value: CharacterV1): CharacterV2 => characterToV2(value)
		},
		{ version: 2, schema: z.object(characterV2Shape) }
	]
});

export type DaydreamCharacterContent = z.output<typeof daydreamCharacterKind.latest>;

const openingSchema = z.object({
	id: clientId,
	label: required(DAYDREAM_LIMITS.openingLabel),
	situation: required(DAYDREAM_LIMITS.openingSituation)
});

const trackerSchema = z.object({
	id: clientId,
	name: required(DAYDREAM_LIMITS.trackerName),
	kind: z.enum(TRACKER_KINDS),
	start: optional(DAYDREAM_LIMITS.trackerStart),
	about: optional(DAYDREAM_LIMITS.trackerAbout)
});

const uniqueIds = <T extends { id: string }>(items: readonly T[]) =>
	new Set(items.map((item) => item.id)).size === items.length;

/**
 * v3 of an idea: its premise and the user's part, and everything else as
 * fields; the places its story can start (`openings`); and what the story
 * keeps track of (`trackers`).
 */
const ideaV3Shape = {
	title: required(DAYDREAM_LIMITS.title),
	premise: required(DAYDREAM_LIMITS.premise),
	yourRole: optional(DAYDREAM_LIMITS.yourRole),
	fields: ideaFieldsSchema,
	brief: optional(DAYDREAM_LIMITS.brief),
	research: optional(DAYDREAM_LIMITS.ideaResearch),
	parts: ideaShape.parts,
	openings: z.array(openingSchema).max(MAX_OPENINGS).refine(uniqueIds, 'Duplicate opening'),
	trackers: z
		.array(trackerSchema)
		.max(MAX_TRACKERS)
		.refine(uniqueIds, 'Duplicate tracker')
		.refine(
			(trackers) =>
				new Set(trackers.map((tracker) => tracker.name.toLocaleLowerCase())).size ===
				trackers.length,
			'Two trackers with one name'
		),
	dials: ideaDialsSchema
};

type IdeaV2 = z.output<z.ZodObject<typeof ideaV2Shape>>;
type IdeaV3 = z.output<z.ZodObject<typeof ideaV3Shape>>;

/** A v2 idea's fixed fields, as v3's known fields; it had no openings or trackers. */
function ideaToV3<T extends IdeaV2>({
	setting,
	tone,
	notes,
	...rest
}: T): Omit<T, 'setting' | 'tone' | 'notes'> & Pick<IdeaV3, 'fields' | 'openings' | 'trackers'> {
	return {
		...rest,
		fields: fieldsFrom(['setting', 'tone', 'notes'], { setting, tone, notes }),
		openings: [],
		trackers: []
	};
}

// Named for what an idea was called when it shipped: the name is in every
// stored envelope, so it cannot follow the rename (docs/daydreams.md, "Ideas").
export const daydreamIdeaKind = defineSealedKind({
	name: 'daydream-scene',
	// Every field at its cap, research included, JSON-escaped, sealed and
	// base64url'd. Raised from 24 KB with v3's fields, openings and trackers.
	maxCiphertextLength: 64 * 1024,
	versions: [
		{
			version: 1,
			schema: z.object(ideaShape),
			upcast: (value: z.output<z.ZodObject<typeof ideaShape>>) => ({ ...value, ...NO_ORIGIN })
		},
		{
			version: 2,
			schema: z.object(ideaV2Shape),
			upcast: (value: IdeaV2): IdeaV3 => ideaToV3(value)
		},
		{ version: 3, schema: z.object(ideaV3Shape) }
	]
});

export type DaydreamIdeaContent = z.output<typeof daydreamIdeaKind.latest>;

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

const setupV2Shape = {
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
	// What v4 calls the idea: its key until then, which is stored.
	scene: z.object({ ...ideaShape, ...sourceShape }),
	lead: z.enum(['character', 'me', 'shared']),
	limits: optional(DAYDREAM_LIMITS.limits),
	dials: z.object({
		intensity: dial,
		pace: dial,
		length: z.enum(['short', 'medium', 'long'])
	})
};

/**
 * The same rules the form shows (`voiceProblem`, `castingProblem`), so a
 * setup that makes no sense — a watcher with nothing to watch, a part played
 * twice — cannot be stored either.
 */
function refineSetup(
	value: {
		voice: Pick<DaydreamVoice, 'narrator' | 'stance' | 'protagonistName' | 'governs'>;
		characters: readonly { casting: { partId: string | null } }[];
	} & (
		| { scene: { parts: readonly { id: string }[] } }
		| { idea: { parts: readonly { id: string }[] } }
	),
	ctx: z.RefinementCtx
) {
	const problem = voiceProblem(value.voice, value.characters.length);
	if (problem) {
		ctx.addIssue({ code: 'custom', path: ['voice'], message: problem });
	}
	const { parts } = 'idea' in value ? value.idea : value.scene;
	const miscast = castingProblem(value.characters, parts);
	if (miscast) {
		ctx.addIssue({ code: 'custom', path: ['characters'], message: miscast });
	}
}

const setupV2 = z.object(setupV2Shape).superRefine(refineSetup);

// v3: a daydream's pictures (docs/daydreams.md, "Pictures"): whether each
// passage gets one by itself, and in which style.
const setupV3 = z
	.object({
		...setupV2Shape,
		pictures: z.object({ on: z.boolean(), style: z.enum(['photo', 'illustrated']) })
	})
	.superRefine(refineSetup);

// v4: a monologue, a fifth narrator (docs/daydreams.md, "Voices"), and the
// scene renamed the idea, since a monologue has no scene ("Ideas"). The
// narrator list is written out again rather than shared, because a shipped
// version's schema must never change under it.
const { scene: _scene, ...setupV2Rest } = setupV2Shape;
const setupV4 = z
	.object({
		...setupV2Rest,
		idea: setupV2Shape.scene,
		voice: z.object({
			narrator: z.enum(['none', 'second-person', 'third-person', 'impersonal', 'monologue']),
			stance: z.enum(['self', 'persona', 'absent']),
			protagonistName: optional(DAYDREAM_LIMITS.protagonistName)
		}),
		pictures: z.object({ on: z.boolean(), style: z.enum(['photo', 'illustrated']) })
	})
	.superRefine(refineSetup);

// v5: the idea's brief and research (v2 of the idea kind).
const setupV5 = z
	.object({
		...setupV2Rest,
		idea: z.object({ ...ideaV2Shape, ...sourceShape }),
		voice: z.object({
			narrator: z.enum(['none', 'second-person', 'third-person', 'impersonal', 'monologue']),
			stance: z.enum(['self', 'persona', 'absent']),
			protagonistName: optional(DAYDREAM_LIMITS.protagonistName)
		}),
		pictures: z.object({ on: z.boolean(), style: z.enum(['photo', 'illustrated']) })
	})
	.superRefine(refineSetup);

// v6: a system may govern a character rather than the user, answering to
// them (`DaydreamVoice.governs`; docs/daydreams.md, "Voices").
const setupV6 = z
	.object({
		...setupV2Rest,
		idea: z.object({ ...ideaV2Shape, ...sourceShape }),
		voice: z.object({
			narrator: z.enum(['none', 'second-person', 'third-person', 'impersonal', 'monologue']),
			stance: z.enum(['self', 'persona', 'absent']),
			protagonistName: optional(DAYDREAM_LIMITS.protagonistName),
			governs: z.literal('character').optional()
		}),
		pictures: z.object({ on: z.boolean(), style: z.enum(['photo', 'illustrated']) })
	})
	.superRefine(refineSetup);

// v7: characters' and the idea's text as fields (character v2, idea v3), the
// idea's openings and trackers, the opening the story starts from, and
// whether the characters' thoughts are shown (docs/daydreams.md, "Fields",
// "Openings", "Trackers", "Thoughts").
const setupV7 = z
	.object({
		title: setupV2Shape.title,
		voice: z.object({
			narrator: z.enum(['none', 'second-person', 'third-person', 'impersonal', 'monologue']),
			stance: z.enum(['self', 'persona', 'absent']),
			protagonistName: optional(DAYDREAM_LIMITS.protagonistName),
			governs: z.literal('character').optional()
		}),
		characters: z
			.array(z.object({ ...characterV2Shape, ...sourceShape, casting: castingSchema }))
			.max(MAX_DAYDREAM_CHARACTERS),
		idea: z.object({ ...ideaV3Shape, ...sourceShape }),
		lead: setupV2Shape.lead,
		limits: setupV2Shape.limits,
		dials: z.object({
			intensity: dial,
			pace: dial,
			length: z.enum(['short', 'medium', 'long']),
			thoughts: z.enum(['shown', 'hidden'])
		}),
		pictures: z.object({ on: z.boolean(), style: z.enum(['photo', 'illustrated']) }),
		opening: clientId.nullable()
	})
	.superRefine(refineSetup)
	.superRefine((value, ctx) => {
		if (value.opening !== null && !value.idea.openings.some(({ id }) => id === value.opening)) {
			ctx.addIssue({
				code: 'custom',
				path: ['opening'],
				message: 'The story starts from an opening the idea does not have.'
			});
		}
	});

type SetupV6 = z.output<typeof setupV6>;
type SetupV7 = z.output<typeof setupV7>;

export const daydreamSetupKind = defineSealedKind({
	name: 'daydream-setup',
	// Four characters with every field at its cap, an idea likewise, JSON-escaped,
	// sealed and base64url'd, fit inside. Raised from 96 KB with v7's fields.
	maxCiphertextLength: 160 * 1024,
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
			upcast: (value: z.output<typeof setupV1>): z.output<typeof setupV2> => ({
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
					dials: UNSET_IDEA_DIALS
				},
				lead: value.lead,
				limits: value.limits,
				// v2's dials, written out: `DEFAULT_STORY_DIALS` has grown since.
				dials: { intensity: 3, pace: 3, length: 'medium' }
			})
		},
		{
			version: 2,
			schema: setupV2,
			// Pictures came with v3: a daydream from before has them on, in the
			// default style, like a new one.
			upcast: (value: z.output<typeof setupV2>): z.output<typeof setupV3> => ({
				...value,
				pictures: DEFAULT_PICTURES
			})
		},
		{
			version: 3,
			schema: setupV3,
			// Every v3 voice is a v4 voice, since v4 only adds one; its scene is v4's idea.
			upcast: ({ scene, ...rest }: z.output<typeof setupV3>): z.output<typeof setupV4> => ({
				...rest,
				idea: scene
			})
		},
		{
			version: 4,
			schema: setupV4,
			upcast: ({ idea, ...rest }: z.output<typeof setupV4>): z.output<typeof setupV5> => ({
				...rest,
				idea: { ...idea, ...NO_ORIGIN }
			})
		},
		{
			version: 5,
			schema: setupV5,
			// Every v5 voice is a v6 one: a system governed the user until then.
			upcast: (value: z.output<typeof setupV5>): z.output<typeof setupV6> => value
		},
		{
			version: 6,
			schema: setupV6,
			// Fixed fields become known fields, thoughts are shown as they always
			// were, and the story starts from the premise, as it always did.
			upcast: ({ characters, idea, dials, ...rest }: SetupV6): SetupV7 => ({
				...rest,
				characters: characters.map((character) => characterToV2(character)),
				idea: ideaToV3(idea),
				dials: { ...dials, thoughts: 'shown' },
				opening: null
			})
		},
		{ version: 7, schema: setupV7 }
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

/**
 * v6's: a passage may carry the picture the model described for it
 * (`image`, docs/daydreams.md, "Pictures"), what the page asks the image
 * model for. A schema of its own, since `passageMetaSchema` is frozen with
 * every turn version from v3 to v5. What `parseReply` reads a reply with.
 */
export const passageMetaV6 = passageMetaSchema.extend({
	image: z.string().trim().min(1).max(DAYDREAM_LIMITS.imagePrompt).optional()
});

/**
 * The settings a passage changed because the user asked outright — longer
 * passages, slower, more intense, more or less sexual or kinky
 * (docs/daydreams.md, "Settings the story changes"). The new values; at
 * least one.
 */
export const storySettingsSchema = z
	.object({
		length: z.enum(['short', 'medium', 'long']).optional(),
		pace: dial.optional(),
		intensity: dial.optional(),
		heat: dial.optional(),
		kink: dial.optional(),
		/**
		 * Characters' own dials, by name, as the story has changed them: the
		 * chaste one who has grown eager over a training story.
		 */
		characters: z
			.array(
				z.object({
					name: z.string().trim().min(1).max(DAYDREAM_LIMITS.characterName),
					libido: dial.optional(),
					kink: dial.optional()
				})
			)
			.max(MAX_DAYDREAM_CHARACTERS)
			.optional()
	})
	.refine(
		(value) =>
			Object.entries(value).some(([key, set]) => key !== 'characters' && set !== undefined) ||
			(value.characters?.length ?? 0) > 0,
		'Say which setting changed'
	);

export type StorySettings = z.output<typeof storySettingsSchema>;

/**
 * The same settings as they were before, for Undo: the idea's heat and kink
 * may have been unset, so those may be null.
 */
const settingsBeforeSchema = z.object({
	length: z.enum(['short', 'medium', 'long']).optional(),
	pace: dial.optional(),
	intensity: dial.optional(),
	heat: dial.nullable().optional(),
	kink: dial.nullable().optional(),
	characters: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(DAYDREAM_LIMITS.characterName),
				libido: dial.nullable().optional(),
				kink: dial.nullable().optional()
			})
		)
		.max(MAX_DAYDREAM_CHARACTERS)
		.optional()
});

export type StorySettingsBefore = z.output<typeof settingsBeforeSchema>;

/**
 * v7's: a passage may carry the settings it changed (`settings`) and what
 * they were (`settingsBefore`), written by the browser from what the model
 * set in its metadata, and only for a reply to the user's own words.
 */
export const passageMetaV7 = passageMetaV6.extend({
	settings: storySettingsSchema.optional(),
	settingsBefore: settingsBeforeSchema.optional(),
	/**
	 * How the story has moved on from its setup, in a line, when the model
	 * says it now contradicts the idea or a character for good: what the
	 * thread's "Update the idea" offer is about (docs/daydreams.md, "When the
	 * story moves on"). Added to v7 before any build wrote one.
	 */
	drifted: z.string().trim().min(1).max(DAYDREAM_LIMITS.drifted).optional()
});

/**
 * v8's: a passage written by "Write again" says so (`rewriteOf.again`). It
 * is another take, not a rewrite: its request showed the model the take it
 * replaces and asked for a different one (docs/daydreams.md, "Another take"),
 * and later requests send that again, as it was sent. Neither a quote nor an
 * instruction comes with it.
 */
export const passageMetaV8 = passageMetaV7.extend({
	rewriteOf: z
		.object({
			turnId: clientId,
			quote: quoteSchema.optional(),
			instruction: z.string().trim().max(DAYDREAM_LIMITS.instruction).optional(),
			again: z.literal(true).optional()
		})
		.refine(
			(value) => !(value.again && (value.quote || value.instruction)),
			'Another take is not asked to change anything in particular'
		)
		.optional()
});

/** A tracker's value (`TrackerValue`): a meter's or count's number, a list's items, a line. */
export const trackerValueSchema = z.union([
	z.number().finite(),
	z.string().trim().max(DAYDREAM_LIMITS.trackerText),
	z.array(z.string().trim().min(1).max(DAYDREAM_LIMITS.trackerItem)).max(20)
]);

/**
 * v9's: an opening passage says which of the idea's openings it was written
 * from, as it read then (`opening`), so the history sends its request again
 * exactly as it was sent even after the idea changes (docs/daydreams.md,
 * "Openings"); and a passage carries every tracker's value after it
 * (`trackers`, by tracker id), so each branch has its own (docs/daydreams.md,
 * "Trackers"). Both written by the page, never read from the model.
 */
export const passageMetaV9 = passageMetaV8.extend({
	opening: z
		.object({
			label: required(DAYDREAM_LIMITS.openingLabel),
			situation: required(DAYDREAM_LIMITS.openingSituation)
		})
		.optional(),
	trackers: z
		.record(clientId, trackerValueSchema)
		.refine((values) => Object.keys(values).length <= MAX_TRACKERS, 'Too many trackers')
		.optional()
});

/** A passage's meta as the latest turn version stores it (`passageMetaV9`). */
export type PassageMeta = z.output<typeof passageMetaV9>;

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

// v6: a passage may carry the picture the model described for it
// (`passageMetaV6`).

const turnV6 = z.discriminatedUnion('type', [
	textTurn(passageMetaV6).extend({
		raw: z.string().min(1).max(DAYDREAM_LIMITS.rawReply).optional(),
		rawTruncated: z.literal(true).optional(),
		sent: sentRecordSchema.optional()
	}),
	...turnTypesV2
]);

// v7: a passage may carry the settings it changed when the user asked
// (`passageMetaV7`).
const turnV7 = z.discriminatedUnion('type', [
	textTurn(passageMetaV7).extend({
		raw: z.string().min(1).max(DAYDREAM_LIMITS.rawReply).optional(),
		rawTruncated: z.literal(true).optional(),
		sent: sentRecordSchema.optional()
	}),
	...turnTypesV2
]);

// v8: a passage written by "Write again" says so (`passageMetaV8`).
const turnV8 = z.discriminatedUnion('type', [
	textTurn(passageMetaV8).extend({
		raw: z.string().min(1).max(DAYDREAM_LIMITS.rawReply).optional(),
		rawTruncated: z.literal(true).optional(),
		sent: sentRecordSchema.optional()
	}),
	...turnTypesV2
]);

// v9: an opening passage's opening, and every passage's tracker values
// (`passageMetaV9`).
const turnV9 = z.discriminatedUnion('type', [
	textTurn(passageMetaV9).extend({
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
		{
			version: 5,
			schema: turnV5,
			// Everything v5 could say, v6 says the same way.
			upcast: (value: z.output<typeof turnV5>) => value
		},
		{
			version: 6,
			schema: turnV6,
			// Everything v6 could say, v7 says the same way.
			upcast: (value: z.output<typeof turnV6>) => value
		},
		{
			version: 7,
			schema: turnV7,
			// Everything v7 could say, v8 says the same way.
			upcast: (value: z.output<typeof turnV7>) => value
		},
		{
			version: 8,
			schema: turnV8,
			// Everything v8 could say, v9 says the same way.
			upcast: (value: z.output<typeof turnV8>) => value
		},
		{ version: 9, schema: turnV9 }
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

// v3: a passage's picture (docs/daydreams.md, "Pictures"). The image is
// stored encrypted, apart from this record, under its own per-file age
// identity (`key`, as a message attachment's is), so only this record — and
// whoever can open it — can read it.
const markV3 = z.discriminatedUnion('type', [
	bookmarkMark,
	z.object({
		type: z.literal('reaction'),
		reaction: z.enum(['love', 'like', 'not-for-me']),
		after: clientId.optional()
	}),
	z.object({
		type: z.literal('picture'),
		imageId: clientId,
		key: z.string().regex(/^AGE-SECRET-KEY-1[0-9A-Z]+$/),
		mimeType: z.enum(['image/webp', 'image/png', 'image/jpeg']),
		width: z.number().int().min(1).max(4096),
		height: z.number().int().min(1).max(4096),
		/**
		 * What the image model was asked, exactly (`PictureRequest`): kept for
		 * debug mode's raw log, and only for an account granted it, as a
		 * passage's `raw` is.
		 */
		sent: z
			.object({
				model: z.string().min(1).max(200),
				positivePrompt: z.string().max(MAX_PICTURE_REQUEST_PROMPT),
				negativePrompt: z.string().max(MAX_PICTURE_REQUEST_PROMPT)
			})
			.optional()
	})
]);

export const daydreamMarkKind = defineSealedKind({
	name: 'daydream-mark',
	// Raised from 4 KB with v3, whose picture may carry the prompts it was
	// made from (`sent`), both at their longest.
	maxCiphertextLength: 8 * 1024,
	versions: [
		{
			version: 1,
			schema: markV1,
			// A reaction from before v2 says nothing of where it was made, and
			// goes back beside its passage, as it always did.
			upcast: (value: z.output<typeof markV1>) => value
		},
		{
			version: 2,
			schema: markV2,
			// Everything v2 could say, v3 says the same way.
			upcast: (value: z.output<typeof markV2>) => value
		},
		{ version: 3, schema: markV3 }
	]
});

export type DaydreamMarkContent = z.output<typeof daydreamMarkKind.latest>;

// ── exchanges ────────────────────────────────────────────────────────────────

/**
 * One request to the model and its answer, verbatim, for debug mode's raw
 * log (`daydream/exchange.ts`). Compressed (`compressed` on
 * `defineSealedKind`): the request repeats the story's history and the
 * response is hundreds of near-identical events, so it deflates many times
 * over, and the server handled every byte of it in plaintext on its way to
 * and from the model, so what the compressed length could say about it is
 * nothing the server did not already see.
 */
const exchangeV1 = z.object({
	endpoint: z.literal('chat/completions'),
	request: z.string().min(1).max(EXCHANGE_LIMITS.request),
	response: z.object({
		status: z.number().int().min(100).max(599),
		body: z.string().max(EXCHANGE_LIMITS.response),
		truncated: z.literal(true).optional()
	}),
	ended: z.enum(['done', 'error', 'stopped', 'dropped']),
	startedAt: z.number().int().nonnegative(),
	endedAt: z.number().int().nonnegative()
});

export const daydreamExchangeKind = defineSealedKind({
	name: 'daydream-exchange',
	maxCiphertextLength: MAX_EXCHANGE_CIPHERTEXT,
	compressed: true,
	versions: [{ version: 1, schema: exchangeV1 }]
});

export type DaydreamExchangeContent = z.output<typeof daydreamExchangeKind.latest>;

// ── setup exchanges ──────────────────────────────────────────────────────────

/**
 * A suggestion request that wrote a daydream's draft, and its answer, kept
 * with the daydream for debug mode's raw log (`daydream/setup-exchange.ts`).
 * Compressed for the reason exchanges are: the server handled all of it in
 * plaintext on its way to and from the model, and an answer that read a
 * brief's links carries each page in full.
 */
const setupExchangeV1 = z.object({
	task: z.enum(['daydream', 'ideas']),
	request: z.string().min(1).max(EXCHANGE_LIMITS.request),
	response: z.object({
		body: z.string().max(EXCHANGE_LIMITS.response),
		truncated: z.literal(true).optional()
	}),
	startedAt: z.number().int().nonnegative(),
	endedAt: z.number().int().nonnegative()
});

export const daydreamSetupExchangeKind = defineSealedKind({
	name: 'daydream-setup-exchange',
	maxCiphertextLength: MAX_EXCHANGE_CIPHERTEXT,
	compressed: true,
	versions: [{ version: 1, schema: setupExchangeV1 }]
});

export type DaydreamSetupExchangeContent = z.output<typeof daydreamSetupExchangeKind.latest>;
