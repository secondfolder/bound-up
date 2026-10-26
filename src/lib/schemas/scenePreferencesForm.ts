import { z } from 'zod';
import { SEALED_PATTERN } from '$lib/sealed';
import { scenePreferencesKind } from '$lib/sealed-kinds/scenes';
import { isClientId } from '$lib/vault';

const clientId = z.string().refine(isClientId, 'Malformed id');

/**
 * `PUT /api/scenes/preferences`: the sealed settings, new when
 * `expectedRevision` is null. Shared by the endpoint and the browser.
 */
export const scenePreferencesSaveSchema = z.object({
	id: clientId,
	vaultId: clientId,
	ciphertext: z.string().min(1).max(scenePreferencesKind.maxCiphertextLength).regex(SEALED_PATTERN),
	payloadVersion: z.number().int().positive(),
	expectedRevision: z.number().int().min(0).nullable()
});

export type ScenePreferencesSave = z.output<typeof scenePreferencesSaveSchema>;
