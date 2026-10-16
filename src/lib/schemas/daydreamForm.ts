import { z } from 'zod';
import {
	DAYDREAM_LIMITS,
	DEFAULT_STORY_DIALS,
	EMPTY_CHARACTER,
	EMPTY_SCENE,
	MAX_DAYDREAM_CHARACTERS,
	voiceProblem
} from '$lib/daydream';
import { SEALED_PATTERN } from '$lib/sealed';
import { isClientId } from '$lib/vault';

/**
 * The Daydreams forms and requests. See docs/daydreams.md.
 *
 * The setup form is edited in the browser and sealed before it is posted, so
 * the schema the server reads is `daydreamSealedSubmitSchema`: the sealed
 * record in place of the fields. The editor's own schema is here for the
 * client-side checks and the save button, and says the same as the sealed
 * kind (`sealed-kinds/daydreams.ts`), which is what every reader re-runs.
 */

/*
 * No `.trim()` here, deliberately. superforms' client-side validation writes
 * the schema's *parsed* value back into the form as it validates each change,
 * so a trim ran on every keystroke and deleted each space the moment it was
 * typed, before the next word could follow it. The sealed kind
 * (`daydreamSetupKind`) trims instead, as the setup is sealed — which is the
 * only place a trimmed value is ever stored — and these only check.
 */
const required = (max: number, what: string) =>
	z
		.string()
		.max(max, `Please keep this to ${max} characters or fewer`)
		.refine((value) => value.trim() !== '', `Please give ${what}`);
const optional = (max: number) =>
	z.string().max(max, `Please keep this to ${max} characters or fewer`);

const dial = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

const characterDials = z.object({
	tone: z.enum(['warm', 'teasing', 'cold', 'clinical']).nullable(),
	control: dial.nullable(),
	strictness: dial.nullable(),
	edge: dial.nullable(),
	talk: dial.nullable()
});

const characterFields = {
	name: required(DAYDREAM_LIMITS.characterName, 'them a name'),
	archetype: optional(DAYDREAM_LIMITS.archetype),
	personality: optional(DAYDREAM_LIMITS.personality),
	speech: optional(DAYDREAM_LIMITS.speech),
	appearance: optional(DAYDREAM_LIMITS.appearance),
	relationship: optional(DAYDREAM_LIMITS.relationship),
	likes: optional(DAYDREAM_LIMITS.likes),
	notes: optional(DAYDREAM_LIMITS.characterNotes),
	dials: characterDials
};

const sceneFields = {
	title: required(DAYDREAM_LIMITS.title, 'it a title'),
	setting: optional(DAYDREAM_LIMITS.setting),
	premise: required(DAYDREAM_LIMITS.premise, 'what is going on'),
	yourRole: optional(DAYDREAM_LIMITS.yourRole),
	tone: optional(DAYDREAM_LIMITS.tone),
	notes: optional(DAYDREAM_LIMITS.sceneNotes)
};

const source = {
	sourceId: z.string().nullable(),
	sourceRevision: z.number().int().min(0).nullable()
};

const storyDials = z.object({
	intensity: dial,
	pace: dial,
	length: z.enum(['short', 'medium', 'long'])
});

/**
 * The setup form. Nested — a voice, a list of characters, a scene, the dials
 * — so it is posted as JSON (`dataType: 'json'`), and then only as the sealed
 * record: `DaydreamSetupForm.svelte` replaces the whole post.
 */
export const daydreamSetupFormSchema = z
	.object({
		title: required(DAYDREAM_LIMITS.title, 'it a title'),
		voice: z.object({
			narrator: z.enum(['none', 'second-person', 'third-person', 'impersonal']),
			stance: z.enum(['self', 'persona', 'absent']),
			protagonistName: optional(DAYDREAM_LIMITS.protagonistName)
		}),
		characters: z
			.array(z.object({ ...characterFields, ...source }))
			.max(MAX_DAYDREAM_CHARACTERS, `Up to ${MAX_DAYDREAM_CHARACTERS} characters`),
		scene: z.object({ ...sceneFields, ...source }),
		lead: z.enum(['character', 'me', 'shared']),
		limits: optional(DAYDREAM_LIMITS.limits),
		dials: storyDials
	})
	.superRefine((value, ctx) => {
		const problem = voiceProblem(value.voice, value.characters.length);
		if (problem) {
			ctx.addIssue({ code: 'custom', path: ['voice'], message: problem });
		}
	});

export type DaydreamSetupFormSchema = typeof daydreamSetupFormSchema;
export type DaydreamSetupFormValues = z.output<DaydreamSetupFormSchema>;

/** The fields a new setup starts with: talking with a character, who is still to be added. */
export const EMPTY_DAYDREAM_SETUP: DaydreamSetupFormValues = {
	title: '',
	voice: { narrator: 'none', stance: 'self', protagonistName: '' },
	characters: [],
	scene: { ...EMPTY_SCENE, sourceId: null, sourceRevision: null },
	lead: 'character',
	limits: '',
	dials: DEFAULT_STORY_DIALS
};

/**
 * The character dialog. `saveToLibrary` is not part of the character: it
 * decides whether the dialog saves one to the library or only hands a copy
 * back to the daydream being set up.
 */
export const daydreamCharacterFormSchema = z.object({
	...characterFields,
	saveToLibrary: z.boolean()
});

export type DaydreamCharacterFormValues = z.output<typeof daydreamCharacterFormSchema>;

export const EMPTY_CHARACTER_FORM: DaydreamCharacterFormValues = {
	...EMPTY_CHARACTER,
	saveToLibrary: true
};

export const daydreamSceneFormSchema = z.object({ ...sceneFields, saveToLibrary: z.boolean() });

export type DaydreamSceneFormValues = z.output<typeof daydreamSceneFormSchema>;

export const EMPTY_SCENE_FORM: DaydreamSceneFormValues = { ...EMPTY_SCENE, saveToLibrary: true };

const sealedFields = {
	vaultId: z.string().refine(isClientId, 'Malformed id'),
	ciphertext: z
		.string()
		.min(1)
		// The largest kind's cap: a setup with four characters (`daydreamSetupKind`).
		.max(96 * 1024)
		.regex(SEALED_PATTERN),
	payloadVersion: z.coerce.number().int().positive()
};

/** The setup form as it is posted: the sealed setup, and the revision it was edited from. */
export const daydreamSealedSubmitSchema = z.object({
	recordId: z.string().refine(isClientId, 'Malformed id'),
	...sealedFields,
	expectedRevision: z.coerce.number().int().min(0).optional()
});

export type DaydreamSealedSubmit = z.output<typeof daydreamSealedSubmitSchema>;

const clientId = z.string().refine(isClientId, 'Malformed id');

/** A new turn, as `POST /api/daydreams/[id]/turns` takes it. */
export const appendTurnSchema = z.object({
	id: clientId,
	parentId: clientId.nullable(),
	role: z.enum(['user', 'story']),
	...sealedFields
});

/** `POST /api/daydreams/[id]/turns/read`: turns to open, by id. */
export const readTurnsSchema = z.object({
	ids: z.array(clientId).min(1).max(100)
});

/** `PUT /api/daydreams/[id]/active`: the turn to move to. */
export const setActiveSchema = z.object({ turnId: clientId });

/** `PUT /api/daydreams/[id]/setup`: a setup changed from the story page (the dials, "not this"). */
export const putSetupSchema = z.object({
	...sealedFields,
	expectedRevision: z.number().int().min(0)
});

/** `POST /api/daydreams/[id]/marks`: a bookmark or reaction. */
export const createMarkSchema = z.object({
	id: clientId,
	turnId: clientId,
	...sealedFields
});

/** `POST /api/daydreams/characters` and `…/scenes`: a new library item, sealed. */
export const createLibraryItemSchema = z.object({ id: clientId, ...sealedFields });

/** `PUT /api/daydreams/characters/[id]` and `…/scenes/[id]`. */
export const updateLibraryItemSchema = z.object({
	...sealedFields,
	expectedRevision: z.number().int().min(0)
});
