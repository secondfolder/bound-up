import { z } from 'zod';
import { MAX_CIPHERTEXT_BYTES, MAX_REACTION_CIPHERTEXT_BYTES, THREAD_ICONS } from '$lib/messaging';
import { SEALED_PATTERN } from '$lib/sealed';
import { isClientId, MAX_VAULT_WRAP_LENGTH, VAULT_WRAP_PATTERN } from '$lib/vault';

/**
 * What the browser posts when sending a message.
 *
 * Note what this validates and what it cannot. It checks the *envelope* — the
 * icon is one of a closed list, the body is a sealed record within a bound — and never
 * the content, because the content is ciphertext the server cannot read. Both
 * the endpoint and the client import these, so the client refuses before
 * spending a network round trip on 25 MB.
 *
 * This feature does not use superforms, and that is deliberate rather than an
 * omission: superforms exists to bind a `SuperValidated` to a `<form>` and
 * re-render errors from an action, and there is no action here. The body has to
 * be built in the browser because only the browser can encrypt it, so sending
 * is a `fetch` to a `+server.ts`. Zod still does the validating.
 */

export const threadIconSchema = z.enum(THREAD_ICONS);

/**
 * A sealed record's ciphertext: `sb1.` and base64url (`src/lib/sealed.ts`).
 * The charset check also catches a plaintext body posted by mistake, since
 * prose contains spaces and newlines. Each kind's exact cap is checked again
 * in the data layer, against the kind.
 */
const sealedSchema = (max: number, tooLong: string) =>
	z.string().min(1, 'Nothing to send').max(max, tooLong).regex(SEALED_PATTERN, 'Malformed message');

const bodySchema = sealedSchema(MAX_CIPHERTEXT_BYTES, 'That message is too long');
const reactionBodySchema = sealedSchema(MAX_REACTION_CIPHERTEXT_BYTES, 'That reaction is too long');

/** A record id or vault id chosen by the browser. See `isClientId`. */
const clientIdSchema = z.string().refine(isClientId, 'Malformed id');

/** A payload version. Coerced, because a send arrives as multipart form fields. */
const versionSchema = z.coerce.number().int().positive();

/** An optional field of a multipart form: absent, empty and null all mean "none". */
const optional = <T extends z.ZodType>(schema: T) =>
	z.preprocess(
		(value) => (value === null || value === undefined || value === '' ? undefined : value),
		schema.optional()
	);

const sealedMessageFields = {
	/** The new message's id, chosen by the browser: it is part of what the body is sealed to. */
	messageId: clientIdSchema,
	/** The partnership vault the body was sealed under. Must be the partnership's own. */
	vaultId: clientIdSchema,
	ciphertext: bodySchema,
	payloadVersion: versionSchema,
	metadataCiphertext: optional(bodySchema),
	metadataVersion: optional(versionSchema)
};

export const newThreadSchema = z.object({ icon: threadIconSchema, ...sealedMessageFields });

export const replySchema = z.object(sealedMessageFields);

export const reactionSchema = z.object({
	/** A fresh id per write: the record the reaction is sealed to. */
	id: clientIdSchema,
	vaultId: clientIdSchema,
	ciphertext: reactionBodySchema,
	payloadVersion: versionSchema
});

export const messageMetadataSchema = z.object({
	metadataCiphertext: bodySchema,
	metadataVersion: versionSchema
});

/**
 * Approving a partner-assisted restore: the partnership vault, wrapped for the
 * key the requester is about to have. See `restoreVaultAccess`.
 */
export const restoreApplySchema = z.object({
	requestId: z.string().uuid('Malformed request id'),
	vaultWrap: z.string().min(1).max(MAX_VAULT_WRAP_LENGTH).regex(VAULT_WRAP_PATTERN),
	escrowRelay: z
		.object({
			escrowId: clientIdSchema,
			ciphertext: z.string().min(1).max(MAX_VAULT_WRAP_LENGTH).regex(VAULT_WRAP_PATTERN)
		})
		.optional()
});

export const restoreDeclineSchema = z.object({
	requestId: z.string().uuid('Malformed request id')
});

export type NewThreadInput = z.output<typeof newThreadSchema>;
export type ReplyInput = z.output<typeof replySchema>;
export type RestoreApplyInput = z.output<typeof restoreApplySchema>;
