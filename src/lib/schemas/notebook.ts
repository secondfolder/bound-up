import { z } from 'zod';
import { isNotebookKind, isPartnerAccess, NOTEBOOK_LIMITS } from '$lib/notebook';
import { SEALED_PATTERN } from '$lib/sealed';
import { isClientId } from '$lib/vault';

/**
 * What the notebook's endpoints accept. Every content field is a sealed
 * record, so all that can be checked here is its envelope: a client id, a
 * vault, a version and a ciphertext of the right shape and size. The kind's
 * own cap is checked again by `sealedIsAcceptable`.
 */

const clientId = z.string().refine(isClientId, 'Expected an id from this device');

function sealed(maxLength: number) {
	return z.object({
		vaultId: clientId,
		ciphertext: z.string().min(1).max(maxLength).regex(SEALED_PATTERN),
		payloadVersion: z.number().int().positive()
	});
}

const sealedUpdate = sealed(NOTEBOOK_LIMITS.updateCiphertext).extend({ id: clientId });
const sealedAwareness = sealed(NOTEBOOK_LIMITS.awarenessCiphertext).extend({ id: clientId });

/** One batch of edits, a cursor update, or both, from one page. */
export const notebookPostSchema = z
	.object({
		/** The posting page's random id, echoed in the frame so it can skip its own. */
		origin: clientId,
		update: sealedUpdate.optional(),
		awareness: sealedAwareness.optional()
	})
	.refine((body) => body.update || body.awareness, 'Expected an update, a cursor, or both');

export const notebookHeaderSchema = sealed(NOTEBOOK_LIMITS.headerCiphertext).extend({
	expectedRevision: z.number().int().nonnegative()
});

export const notebookVersionSchema = sealed(NOTEBOOK_LIMITS.snapshotCiphertext).extend({
	id: clientId,
	upToSeq: z.number().int().positive(),
	restoredFromVersionId: clientId.nullable()
});

/**
 * Creating an entry: the form posts the sealed header and first edit in
 * place of anything typed, as `sealed-forms.ts` does for tasks.
 */
export const notebookCreateSchema = z.object({
	id: clientId,
	kind: z.string().refine(isNotebookKind, 'Expected a journal entry, a note or a scene'),
	entryDate: z.string().nullable(),
	header: sealed(NOTEBOOK_LIMITS.headerCiphertext),
	firstUpdate: sealedUpdate
});

export const partnerAccessSchema = z.object({
	access: z.string().refine(isPartnerAccess, 'Expected edit, read or hidden')
});
