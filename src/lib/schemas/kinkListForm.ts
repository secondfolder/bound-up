import { z } from 'zod';
import { SEALED_PATTERN } from '$lib/sealed';
import { kinkListKind } from '$lib/sealed-kinds/kink-list';
import { isClientId } from '$lib/vault';

const clientId = z.string().refine(isClientId, 'Malformed id');

/**
 * `PUT /api/kink-lists/[scope]`: a sealed list, new when `expectedRevision`
 * is null. Shared by the endpoint and the browser that builds the request.
 */
export const kinkListSaveSchema = z.object({
	id: clientId,
	vaultId: clientId,
	ciphertext: z.string().min(1).max(kinkListKind.maxCiphertextLength).regex(SEALED_PATTERN),
	payloadVersion: z.number().int().positive(),
	expectedRevision: z.number().int().min(0).nullable(),
	/**
	 * Keep the list being replaced as a version even if it changed within the
	 * week: sent once, by "Start a new list" on a list that will not open.
	 */
	keepVersion: z.boolean().optional()
});

export type KinkListSave = z.output<typeof kinkListSaveSchema>;
