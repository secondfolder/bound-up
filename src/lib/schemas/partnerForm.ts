import { z } from 'zod';
import { SEALED_PATTERN } from '$lib/sealed';
import { isClientId } from '$lib/vault';

/**
 * The questions asked when adding a partner, plus the optional roles.
 *
 * Shared by `/settings/partners/new`, the accept screen at `/invite/[token]`
 * and the edit screen, so the wording of a validation error is identical
 * wherever the same field is collected.
 */

/** "Who's in control?" is always asked from the answerer's own side. */
export const controlAnswerSchema = z.enum(['me', 'them', 'mix']);

/*
 * No `.trim()` in these, deliberately. superforms' client-side validation
 * writes the schema's *parsed* value back into the form after each change once
 * the form is valid, so a trim here deleted every space the moment it was
 * typed: "Mistress Jane" could only be entered as "MistressJane". The sealed
 * kinds (`sealed-kinds/partnerships.ts`) trim instead, as the names are
 * sealed, which is the only place they are stored; these only check.
 */
const nameSchema = z
	.string()
	// Nav tabs and avatars render this; unbounded input would break the layout
	// long before it broke the database.
	.max(60, 'Please keep this to 60 characters or fewer')
	.refine((value) => value.trim() !== '', 'Please enter a name');

const roleSchema = z
	.string()
	.max(40, 'Please keep this to 40 characters or fewer')
	// An empty box means "no role", not an empty string — normalising here
	// keeps the column NULL rather than '' for the same intent. A box of only
	// spaces is empty too: the sealed kind would trim it to '' and refuse it.
	.transform((value) => (value.trim() === '' ? null : value))
	.nullable()
	.default(null);

export const partnerInviteFormSchema = z.object({
	/** "What's their name/title?" */
	partnerName: nameSchema,
	/** "What do they call you?" */
	yourName: nameSchema,
	/** Their half of the "Roles" section. */
	partnerRole: roleSchema,
	/** Your half of the "Roles" section. */
	yourRole: roleSchema,
	control: controlAnswerSchema
});

export type PartnerInviteFormSchema = typeof partnerInviteFormSchema;

// `z.output` rather than superforms' `Infer<>`: see AGENTS.md on Biome's stack overflow.
export type PartnerInviteFormValues = z.output<typeof partnerInviteFormSchema>;

/**
 * The accept screen.
 *
 * Same fields, because when the accepter holds control (or shares it) they may
 * rewrite every one of them. When they do not, the action ignores the submitted
 * values entirely rather than trusting a disabled input — a disabled field is a
 * rendering decision, not a security boundary.
 */
export const partnerAcceptFormSchema = partnerInviteFormSchema;

export type PartnerAcceptFormSchema = typeof partnerAcceptFormSchema;

/** The edit screen. Identical shape; the server re-checks who may submit it. */
export const partnerEditFormSchema = partnerInviteFormSchema;

export type PartnerEditFormSchema = typeof partnerEditFormSchema;

/*
 * What the partner forms actually post. The names and roles above are
 * validated in the browser and sealed there — under the invite key before
 * there is a partnership, in its vault after — and the sealed record is
 * posted in their place (`partner-sealing.ts`). The server checks these
 * shapes, the vault, and who may write, never the names. See docs/partners.md,
 * "Names are sealed".
 */

const clientId = z.string().refine(isClientId, 'Malformed id');
const sealed = z.string().max(4096).regex(SEALED_PATTERN);
const version = z.coerce.number().int().positive();
/** An age-encrypted key, base64: what `wrapInviteKey` produces. */
const keyWrap = z
	.string()
	.max(4096)
	.regex(/^[A-Za-z0-9+/]+={0,2}$/);

/** A new invite: chosen by the browser, because the invite is sealed to its id. */
export const partnerInviteSealedSchema = z.object({
	id: clientId,
	control: controlAnswerSchema,
	inviteCiphertext: sealed,
	invitePayloadVersion: version,
	inviteKeyWrap: keyWrap
});

/** Re-issuing an invite: a new key, so a new sealed invite and wrap. */
export const partnerRotateSealedSchema = partnerInviteSealedSchema.omit({
	id: true,
	control: true
});

/**
 * Accepting: the control answer, and the names re-sealed under the same
 * invite key. Both optional — the server only honours them from an accepter
 * allowed to edit, and a read-only accept posts neither.
 */
export const partnerAcceptSealedSchema = z.object({
	control: controlAnswerSchema.optional(),
	inviteCiphertext: sealed.optional(),
	invitePayloadVersion: version.optional()
});

/**
 * Editing: the control answer, and the names — sealed in the vault for an
 * accepted partnership (compare-and-swap on `expectedRevision`), or sealed
 * again under the invite key for a pending invite, which has no vault yet.
 */
export const partnerEditSealedSchema = z.object({
	control: controlAnswerSchema,
	namesVaultId: clientId.optional(),
	namesCiphertext: sealed.optional(),
	namesPayloadVersion: version.optional(),
	expectedRevision: z.coerce.number().int().min(0).optional(),
	inviteCiphertext: sealed.optional(),
	invitePayloadVersion: version.optional()
});

/** A posted form as a plain object of its string fields, for `safeParse`. */
export function formFields(formData: FormData): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const [key, value] of formData) {
		if (typeof value === 'string' && value !== '') {
			fields[key] = value;
		}
	}
	return fields;
}
