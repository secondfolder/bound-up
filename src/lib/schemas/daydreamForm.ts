import { z } from 'zod';
import { DAYDREAM_LIMITS } from '$lib/daydream';
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

export const daydreamSetupFormSchema = z.object({
	title: required(DAYDREAM_LIMITS.title, 'it a title'),
	characterName: required(DAYDREAM_LIMITS.characterName, 'the character a name'),
	persona: optional(DAYDREAM_LIMITS.persona),
	lead: z.enum(['character', 'me', 'shared']),
	scenario: required(DAYDREAM_LIMITS.scenario, 'a scenario'),
	tone: optional(DAYDREAM_LIMITS.tone),
	limits: optional(DAYDREAM_LIMITS.limits),
	safeword: optional(DAYDREAM_LIMITS.safeword)
});

export type DaydreamSetupFormSchema = typeof daydreamSetupFormSchema;
export type DaydreamSetupFormValues = z.output<DaydreamSetupFormSchema>;

/** The fields a new setup starts with. */
export const EMPTY_DAYDREAM_SETUP: DaydreamSetupFormValues = {
	title: '',
	characterName: '',
	persona: '',
	lead: 'character',
	scenario: '',
	tone: '',
	limits: '',
	safeword: ''
};

const sealedFields = {
	vaultId: z.string().refine(isClientId, 'Malformed id'),
	ciphertext: z
		.string()
		.min(1)
		.max(64 * 1024)
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

/** A new turn, as `POST /api/daydreams/[id]/turns` takes it. */
export const appendTurnSchema = z.object({
	id: z.string().refine(isClientId, 'Malformed id'),
	role: z.enum(['user', 'character']),
	...sealedFields
});

/** A retried reply, as `PUT /api/daydreams/[id]/turns` takes it. */
export const replaceTurnSchema = z.object({
	turnId: z.string().refine(isClientId, 'Malformed id'),
	expectedRevision: z.number().int().min(0),
	...sealedFields
});
