import { z } from 'zod';
import { SEALED_PATTERN } from '$lib/sealed';
import { isClientId } from '$lib/vault';

/**
 * The bodies of the tag endpoints. A name arrives sealed, with its blind
 * index; the server checks the shapes here and the vault and kind in
 * `createTag` / `updateTag`, and never sees the name. See docs/messaging.md,
 * "Tags".
 */

const clientId = z.string().refine(isClientId, 'Malformed id');

export const sealedTagNameSchema = z.object({
	vaultId: clientId,
	ciphertext: z.string().max(1024).regex(SEALED_PATTERN),
	payloadVersion: z.number().int().positive(),
	/** Full-length base64url HMAC-SHA256, as `blindIndex` produces it. */
	nameIndex: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
});

export const createTagSchema = z.object({
	id: clientId,
	name: sealedTagNameSchema,
	color: z.string().max(16).optional()
});

export const updateTagSchema = z.object({
	name: sealedTagNameSchema.optional(),
	color: z.string().max(16).optional()
});
