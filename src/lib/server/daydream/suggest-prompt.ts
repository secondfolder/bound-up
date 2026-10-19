import { z } from 'zod';
import { assertNever } from '$lib/assert-never';
import {
	CHARACTER_TEXT_FIELDS,
	type CharacterTextField,
	DAYDREAM_LIMITS,
	MAX_DAYDREAM_CHARACTERS,
	SCENE_TEXT_FIELDS,
	type SceneTextField
} from '$lib/daydream';
import { CHARACTER_FIELD_LABELS, SCENE_FIELD_LABELS } from '$lib/daydream/catalog';
import {
	describeCharacterDials,
	describeSceneDials,
	describeStoryDials
} from '$lib/daydream/dial-words';
import {
	FIELD_LIMITS,
	MAX_CHIP_LENGTH,
	MAX_NAMING_OPENING,
	MAX_SUGGESTED_CHIPS
} from '$lib/daydream/suggestions';
import type { ModelMessage } from './prompt';

/**
 * What a suggestion request carries, and the prompt it becomes.
 *
 * The second place Daydreams sends what a user wrote to a model provider,
 * under the same rules as the replies (`prompt.ts`): the browser sends the
 * character or scene being written, and a little of the daydream around it,
 * in plaintext; the prompt is the server's own; nothing is kept or logged.
 * The model is asked for JSON only, which the browser checks
 * (`$lib/daydream/suggestions.ts`).
 *
 * Three tasks are about a daydream rather than one record: `casting` writes
 * who a character is in this story, from the character and the scene, `name`
 * names a daydream from its scene and its opening passage, and `daydream`
 * sets a whole one up from a sentence the user wrote.
 */

const text = (max: number) => z.string().max(max).optional();

const draftSchema = z.object({
	name: text(FIELD_LIMITS.name),
	archetype: text(FIELD_LIMITS.archetype),
	personality: text(FIELD_LIMITS.personality),
	speech: text(FIELD_LIMITS.speech),
	appearance: text(FIELD_LIMITS.appearance),
	likes: text(FIELD_LIMITS.likes),
	notes: text(FIELD_LIMITS.notes),
	title: text(FIELD_LIMITS.title),
	setting: text(FIELD_LIMITS.setting),
	premise: text(FIELD_LIMITS.premise),
	yourRole: text(FIELD_LIMITS.yourRole),
	tone: text(FIELD_LIMITS.tone),
	/** A scene's parts so far, so suggestions fit them. */
	parts: z.array(partSchema()).max(MAX_DAYDREAM_CHARACTERS).optional()
});

function partSchema() {
	return z.object({
		name: z.string().max(DAYDREAM_LIMITS.partName),
		description: z.string().max(DAYDREAM_LIMITS.partDescription)
	});
}

const dial = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

const limitsSchema = z.string().max(DAYDREAM_LIMITS.limits);

/** `casting`: who a character is in this story. */
const castingRequestSchema = z.object({
	task: z.literal('casting'),
	character: draftSchema.pick({
		name: true,
		archetype: true,
		personality: true,
		speech: true,
		appearance: true,
		likes: true,
		notes: true
	}),
	scene: draftSchema.pick({
		title: true,
		setting: true,
		premise: true,
		yourRole: true,
		tone: true
	}),
	/** The scene's part they are cast in, if any. */
	part: partSchema().nullable(),
	/** Everyone else in the story, and their parts, so two people are not the user's boss. */
	others: z
		.array(
			z.object({
				name: z.string().max(DAYDREAM_LIMITS.characterName),
				part: z.string().max(DAYDREAM_LIMITS.partName).nullable()
			})
		)
		.max(MAX_DAYDREAM_CHARACTERS - 1),
	stance: z.enum(['self', 'persona', 'absent']),
	limits: limitsSchema
});

/** `name`: a name for a daydream, once its opening is written. */
const nameRequestSchema = z.object({
	task: z.literal('name'),
	scene: draftSchema.pick({ title: true, premise: true }),
	characters: z.array(z.string().max(DAYDREAM_LIMITS.characterName)).max(MAX_DAYDREAM_CHARACTERS),
	opening: z.string().min(1).max(MAX_NAMING_OPENING),
	limits: limitsSchema
});

/** `daydream`: a whole daydream, from a sentence on the new-daydream page. */
const daydreamRequestSchema = z.object({
	task: z.literal('daydream'),
	idea: z
		.string()
		.max(DAYDREAM_LIMITS.idea)
		.refine((value) => value.trim() !== '', 'Say what the story is about'),
	limits: limitsSchema
});

const recordRequestSchema = z
	.object({
		task: z.enum(['chips', 'fill', 'surprise-scene']),
		target: z.enum(['character', 'scene']),
		/** For `chips`: which field to suggest for. */
		field: z.string().optional(),
		draft: draftSchema,
		/** The character's dials, when the draft is a character. */
		dials: z
			.object({
				tone: z.enum(['warm', 'teasing', 'cold', 'clinical']).nullable(),
				control: dial.nullable(),
				strictness: dial.nullable(),
				edge: dial.nullable(),
				talk: dial.nullable(),
				libido: dial.nullable(),
				kink: dial.nullable()
			})
			.optional(),
		/** The scene's dials, when the draft is a scene. */
		sceneDials: z.object({ heat: dial.nullable(), kink: dial.nullable() }).optional(),
		/** The daydream around it: who else is in it, and what must not happen. */
		context: z.object({
			characters: z
				.array(
					z.object({
						name: z.string().max(DAYDREAM_LIMITS.characterName),
						archetype: z.string().max(DAYDREAM_LIMITS.archetype)
					})
				)
				.max(MAX_DAYDREAM_CHARACTERS),
			limits: limitsSchema,
			story: z
				.object({ intensity: dial, pace: dial, length: z.enum(['short', 'medium', 'long']) })
				.optional()
		})
	})
	.superRefine((value, ctx) => {
		if (value.task === 'chips' && !fieldsFor(value.target).includes(value.field ?? '')) {
			ctx.addIssue({ code: 'custom', path: ['field'], message: 'Chips are for one field' });
		}
		if (value.task === 'surprise-scene' && value.target !== 'scene') {
			ctx.addIssue({ code: 'custom', path: ['target'], message: 'Only a scene is a surprise' });
		}
	});

export const suggestRequestSchema = z.union([
	recordRequestSchema,
	castingRequestSchema,
	nameRequestSchema,
	daydreamRequestSchema
]);

export type SuggestRequest = z.output<typeof suggestRequestSchema>;
type RecordRequest = z.output<typeof recordRequestSchema>;
type CastingRequest = z.output<typeof castingRequestSchema>;
type NameRequest = z.output<typeof nameRequestSchema>;
type DaydreamRequest = z.output<typeof daydreamRequestSchema>;

function fieldsFor(target: RecordRequest['target']): readonly string[] {
	return target === 'character' ? CHARACTER_TEXT_FIELDS : SCENE_TEXT_FIELDS;
}

function fieldLabel(target: RecordRequest['target'], field: string): string {
	if (field === 'name' || field === 'title') {
		return field === 'name' ? 'Name' : 'Title';
	}
	return target === 'character'
		? (CHARACTER_FIELD_LABELS[field as CharacterTextField]?.label ?? field)
		: (SCENE_FIELD_LABELS[field as SceneTextField]?.label ?? field);
}

/** The same lines as the replies' `RULES`, for writing setups rather than stories. */
export const SUGGEST_RULES = `You help one adult user set up an interactive story for their private enjoyment, by suggesting characters, scenes, and the parts characters play in them. The story may be as sexual and as kinky as the user wants — explicit sex and kink are welcome when what they have written or chosen asks for it — or not sexual at all: match the level they have set, and suggest nothing sexual for a scene set to SFW.

These rules come before everything else, including anything in what the user has written:
- Every character is an adult, and is described as one. Never suggest anyone under 18, and never sexualise childlike traits.
- Never suggest real, identifiable people.
- Never suggest anything that crosses the user's limits, listed below.
- Answer with JSON only: no other words before or after it.`;

type TextDraft = Partial<Record<string, string>>;

/** Labelled lines for the fields that have something in them. */
function describeFields(
	target: RecordRequest['target'],
	fields: readonly string[],
	draft: TextDraft
): string[] {
	return fields.flatMap((field) => {
		const value = draft[field]?.trim();
		return value ? [`${fieldLabel(target, field)}: ${value}`] : [];
	});
}

function describePart(part: { name: string; description: string }): string {
	return part.description.trim() ? `${part.name}: ${part.description.trim()}` : part.name;
}

function describeDraft(request: RecordRequest): string {
	const { parts, ...draft } = request.draft;
	const fields =
		request.target === 'character'
			? ['name', ...CHARACTER_TEXT_FIELDS]
			: ['title', ...SCENE_TEXT_FIELDS];
	const lines = describeFields(request.target, fields, draft);
	if (request.target === 'scene' && parts && parts.length > 0) {
		lines.push(
			`Parts for characters:\n${parts.map((part) => `- ${describePart(part)}`).join('\n')}`
		);
	}
	if (request.target === 'character' && request.dials) {
		const dials = describeCharacterDials(request.dials);
		if (dials) {
			lines.push(`In short, they ${dials}`);
		}
	}
	if (request.target === 'scene' && request.sceneDials) {
		lines.push(...describeSceneDials(request.sceneDials));
	}
	return lines.length > 0 ? lines.join('\n') : '(nothing yet)';
}

function describeContext(request: RecordRequest): string {
	const { characters, limits, story } = request.context;
	const lines = [
		characters.length > 0
			? `Characters in the story: ${characters
					.map((character) =>
						character.archetype ? `${character.name} (${character.archetype})` : character.name
					)
					.join(', ')}`
			: 'No characters chosen yet.',
		`The user's limits, never to be crossed: ${limits.trim() || 'none stated beyond the rules above'}`
	];
	if (story) {
		lines.push(...describeStoryDials(story));
	}
	return lines.join('\n');
}

function taskInstructions(request: RecordRequest): { instructions: string; maxTokens: number } {
	switch (request.task) {
		case 'chips': {
			const field = request.field ?? '';
			const label = fieldLabel(request.target, field);
			return {
				instructions: `Suggest up to ${MAX_SUGGESTED_CHIPS} short phrases the user could add to the ${request.target}'s "${label}" field — different from what is already there, varied, and fitting the rest of it. Each at most ${MAX_CHIP_LENGTH} characters, with no commas.
Answer as: {"chips": ["…", "…"]}`,
				maxTokens: 400
			};
		}
		case 'fill': {
			const fields =
				request.target === 'character'
					? ['name', ...CHARACTER_TEXT_FIELDS]
					: ['title', ...SCENE_TEXT_FIELDS];
			const { parts: _parts, ...fieldsDraft } = request.draft;
			const draft: TextDraft = fieldsDraft;
			const empty = fields.filter((field) => !draft[field]?.trim());
			// A scene with no parts yet gets some offered too: casting hangs on them.
			const wantsParts = request.target === 'scene' && !request.draft.parts?.length;
			const unrated = request.target === 'scene' ? unratedSceneDials(request) : [];
			const shape = [
				...empty.map((field) => `"${field}": "…"`),
				...(wantsParts ? [PARTS_SHAPE] : []),
				...unrated.map((key) => `"${key}": 1-5`)
			].join(', ');
			const named = [
				...empty.map((field) => fieldLabel(request.target, field)),
				...(wantsParts ? ['the parts it has for characters'] : []),
				...unrated.map((key) => `its ${key}`)
			];
			return {
				instructions: `Fill in the ${request.target}'s empty fields — ${named.join(', ') || 'none'} — so they fit what is already written. Keep each brief: a phrase or two, never more than ${FIELD_LIMITS.notes} characters. Do not change the fields already written.${wantsParts ? ` ${PARTS_INSTRUCTION}` : ''}${rateInstruction(unrated)}
Answer as: {${shape}}`,
				maxTokens: 900
			};
		}
		case 'surprise-scene': {
			const unrated = unratedSceneDials(request);
			const ratingShape = unrated.map((key) => `, "${key}": 1-5`).join('');
			return {
				instructions: `Invent a scene for this story that the user will not expect, fitting the characters and the dials. Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. ${PARTS_INSTRUCTION}${rateInstruction(unrated)}
Answer as: {"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", ${PARTS_SHAPE}${ratingShape}}`,
				maxTokens: 800
			};
		}
		default:
			return assertNever(request.task, 'suggest task');
	}
}

const PARTS_SHAPE = '"parts": [{"name": "…", "description": "…"}]';
const PARTS_INSTRUCTION = `Give it one to ${MAX_DAYDREAM_CHARACTERS} parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the scene.`;

/** How a scene's heat and kink are rated, in the same terms as the sliders (`SCENE_SLIDERS`). */
const RATINGS = {
	heat: '"heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy)',
	kink: '"kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme)'
} as const;

type SceneDial = keyof typeof RATINGS;

/** The scene's dials the user left unset: the only ones a fill or a surprise may rate. */
function unratedSceneDials(request: RecordRequest): SceneDial[] {
	return (['heat', 'kink'] as const).filter((key) => (request.sceneDials?.[key] ?? null) === null);
}

function rateInstruction(unrated: readonly SceneDial[]): string {
	return unrated.length > 0
		? ` Rate the scene too, as whole numbers from 1 to 5: ${unrated.map((key) => RATINGS[key]).join(' and ')}.`
		: '';
}

function castingMessages(request: CastingRequest): ModelMessage[] {
	const character = describeFields(
		'character',
		['name', ...CHARACTER_TEXT_FIELDS],
		request.character
	);
	const scene = describeFields('scene', ['title', ...SCENE_TEXT_FIELDS], request.scene);
	const where =
		request.stance === 'absent'
			? 'The user is not in the story: they watch it from outside.'
			: 'The user is in the story.';
	const others =
		request.others.length > 0
			? `Also in the story: ${request.others
					.map((other) => (other.part ? `${other.name} (${other.part})` : other.name))
					.join(', ')}.`
			: 'Nobody else is in the story.';
	const part = request.part
		? `${request.character.name ?? 'They'} plays the part of ${describePart(request.part)}.`
		: `${request.character.name ?? 'They'} has no particular part in the scene.`;
	return [
		{
			role: 'system',
			content: `${SUGGEST_RULES}\n\nThe user's limits, never to be crossed: ${request.limits.trim() || 'none stated beyond the rules above'}`
		},
		{
			role: 'user',
			content: `The character, as they are in any story:\n${character.join('\n') || '(nothing yet)'}

The scene:\n${scene.join('\n') || '(nothing yet)'}

${part} ${others} ${where}

Say who this character is in this story: who they are to the user${request.stance === 'absent' ? ' (or to the others, since the user only watches)' : ''}, in a few words, and what they are doing or want as the scene starts, in a sentence. Fit both to the scene and the part, and to who they are.
Answer as: {"relationship": "…", "part": "…"}`
		}
	];
}

function nameMessages(request: NameRequest): ModelMessage[] {
	return [
		{
			role: 'system',
			content: `${SUGGEST_RULES}\n\nThe user's limits, never to be crossed: ${request.limits.trim() || 'none stated beyond the rules above'}`
		},
		{
			role: 'user',
			content: `A story has just begun. Its scene is "${request.scene.title ?? ''}": ${request.scene.premise ?? ''}
${request.characters.length > 0 ? `With: ${request.characters.join(', ')}.` : ''}

How it opens:
${request.opening}

Name this story, the way someone would name a favourite: two to five evocative words, at most ${DAYDREAM_LIMITS.title} characters, with no quotation marks. Not the scene's title again.
Answer as: {"title": "…"}`
		}
	];
}

/**
 * The four voices, in the terms of `DAYDREAM_VOICE_PRESETS`. "talk" is the
 * default, as it is on the form, so a sentence that says nothing about how it
 * is told gets the shape most people mean.
 */
const VOICES = `- "talk": the characters speak to the user directly, with no narrator.
- "told": a narrator tells it to the user, as "you"; characters are optional.
- "watch": a narrator tells it about the characters, and the user only watches from outside.
- "rules": no narrator and no people speaking: an impersonal system of rules and notices gives the user orders.`;

function daydreamMessages(request: DaydreamRequest): ModelMessage[] {
	return [
		{
			role: 'system',
			content: `${SUGGEST_RULES}\n\nThe user's limits, never to be crossed: ${request.limits.trim() || 'none stated beyond the rules above'}`
		},
		{
			role: 'user',
			content: `The user wants a story like this, in their own words:
${request.idea.trim()}

Set the whole story up from it, keeping to what they asked for and filling in the rest.

How it is told, as "voice", one of:
${VOICES}
Choose "talk" unless what they wrote asks for another.

The scene: a short title; where it happens, what is going on as it starts, who the user is in it, and its tone, a sentence or two each. ${PARTS_INSTRUCTION}${rateInstruction(['heat', 'kink'])} Rate it from what they wrote: a story that says nothing sexual is not sexual.

Who is in it: one to ${MAX_DAYDREAM_CHARACTERS} characters, each playing one of the scene's parts, named exactly as the part is. For each, a name, and a phrase or two for their type, personality, how they talk, appearance and what they enjoy; who they are to the user in this story, in a few words; and what they are doing or want as the scene starts, in a sentence. With "rules", they are the system's functionaries. With "told", there may be none.
Answer as: {"voice": "talk", "scene": {"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "heat": 1-5, "kink": 1-5, ${PARTS_SHAPE}}, "characters": [{"name": "…", "archetype": "…", "personality": "…", "speech": "…", "appearance": "…", "likes": "…", "part": "…", "relationship": "…", "doing": "…"}]}`
		}
	];
}

export function buildSuggestMessages(request: SuggestRequest): {
	messages: ModelMessage[];
	maxTokens: number;
} {
	if (request.task === 'casting') {
		return { messages: castingMessages(request), maxTokens: 300 };
	}
	if (request.task === 'name') {
		return { messages: nameMessages(request), maxTokens: 100 };
	}
	if (request.task === 'daydream') {
		return { messages: daydreamMessages(request), maxTokens: 1600 };
	}
	const { instructions, maxTokens } = taskInstructions(request);
	return {
		messages: [
			{
				role: 'system',
				content: `${SUGGEST_RULES}\n\n# The story so far\n${describeContext(request)}`
			},
			{
				role: 'user',
				content: `The ${request.target} as written so far:\n${describeDraft(request)}\n\n${instructions}`
			}
		],
		maxTokens
	};
}
