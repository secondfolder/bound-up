import { z } from 'zod';
import { SEALED_PATTERN } from '$lib/sealed';
import { dreamSetupKind } from '$lib/sealed-kinds/dreams';
import { isClientId } from '$lib/vault';

/**
 * The bodies of the new engine's storage routes (`/api/dreams/…`): ids the
 * browser chose and sealed records. The server checks each record's envelope
 * against its own kind again (`sealedIsAcceptable`); this only bounds the
 * request. See docs/dreams.md, "Storage".
 */

const clientId = z.string().refine(isClientId, 'Malformed id');

const sealed = z.object({
	vaultId: clientId,
	// The largest kind's cap; each route's kind is checked again in the store.
	ciphertext: z.string().min(1).max(dreamSetupKind.maxCiphertextLength).regex(SEALED_PATTERN),
	payloadVersion: z.number().int().positive()
});

export const createDreamSchema = z.object({ id: clientId, setup: sealed });

export const updateDreamSetupSchema = z.object({
	setup: sealed,
	expectedRevision: z.number().int().min(0)
});

export const appendDreamTurnSchema = z.object({
	id: clientId,
	parentId: clientId.nullable(),
	role: z.enum(['user', 'model']),
	content: sealed
});

export const setActiveDreamTurnSchema = z.object({ turnId: clientId });

export const saveDreamNoteSchema = z.object({
	kind: z.enum(['detail', 'summary']),
	id: clientId,
	turnId: clientId,
	content: sealed
});

export const saveDreamPreferencesSchema = z.object({
	content: sealed,
	expectedRevision: z.number().int().min(0).nullable()
});
