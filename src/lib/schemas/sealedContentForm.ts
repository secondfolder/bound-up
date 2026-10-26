import { z } from 'zod';
import { SEALED_PATTERN } from '$lib/sealed';
import { isClientId } from '$lib/vault';

/**
 * A task's or reward's sealed content posted on its own, with none of its
 * settings: what ticking a to-do item in its description sends (the
 * `…Content` actions on the task and reward lists, docs/rich-text.md, "To-do
 * lists"). Not a form anyone fills in — the page builds the post — so it is
 * read with `safeParse` rather than superforms, as a completion is.
 */
const sealedContentFields = {
	recordId: z.string().refine(isClientId, 'Malformed id'),
	vaultId: z.string().refine(isClientId, 'Malformed id'),
	ciphertext: z
		.string()
		.min(1)
		.max(64 * 1024)
		.regex(SEALED_PATTERN),
	payloadVersion: z.coerce.number().int().positive(),
	/** The revision the content was opened at, for compare-and-swap. Never absent: it is always an edit. */
	expectedRevision: z.coerce.number().int().min(0)
};

export const rewardContentSubmitSchema = z.object(sealedContentFields);

export const taskContentSubmitSchema = z.object({
	...sealedContentFields,
	completionMessageCount: z.coerce.number().int().min(0).max(20)
});
