import { z } from 'zod';
import { SEALED_PATTERN } from '$lib/sealed';
import { isClientId } from '$lib/vault';

/**
 * The body of `POST /api/sealing/[scope]`: rows a device has sealed into the
 * scope's vault. Shapes only — the server checks each kind's cap and version
 * again, and cannot check the content. See `server/content-sealing.ts`.
 */

const sealed = z
	.string()
	.min(1)
	.max(64 * 1024)
	.regex(SEALED_PATTERN);
const version = z.number().int().positive();
const rowId = z.string().refine(isClientId, 'Malformed id');

export const sealedContentSchema = z.object({
	vaultId: rowId,
	tasks: z
		.array(
			z.object({
				id: rowId,
				ciphertext: sealed,
				payloadVersion: version,
				completionMessageCount: z.number().int().min(0).max(20)
			})
		)
		.max(50),
	completions: z
		.array(
			z.object({
				id: rowId,
				ciphertext: sealed,
				payloadVersion: version,
				completionMessageIndex: z.number().int().min(0).max(19).nullable()
			})
		)
		.max(50),
	rewards: z.array(z.object({ id: rowId, ciphertext: sealed, payloadVersion: version })).max(50),
	claims: z.array(z.object({ id: rowId, ciphertext: sealed, payloadVersion: version })).max(50),
	names: z.object({ ciphertext: sealed, payloadVersion: version }).optional(),
	tags: z
		.array(
			z.object({
				id: rowId,
				ciphertext: sealed,
				payloadVersion: version,
				nameIndex: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
			})
		)
		.max(50)
		.default([])
});
