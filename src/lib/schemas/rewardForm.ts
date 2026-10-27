import { z } from 'zod';
import { SEALED_PATTERN } from '$lib/sealed';
import { isClientId } from '$lib/vault';

const WHOLE_NUMBER = /^\d+$/;

const creditsSchema = z.coerce
	.number()
	.int('Please enter a whole number')
	.min(0, 'Credits cannot be negative');

const rewardIdSchema = z.string().uuid('Malformed reward id');

const userIdSchema = z.string().trim().min(1, 'Malformed user id');

/**
 * What a reward form actually posts: the cost and whether it is active, which
 * the server checks claims against, and the title and description sealed into
 * the space's vault in place of the text fields (`sealRewardSubmission` in
 * `sealed-forms.ts`). See docs/rewards.md.
 */
export const rewardSealedSubmitSchema = z.object({
	recordId: z.string().refine(isClientId, 'Malformed id'),
	vaultId: z.string().refine(isClientId, 'Malformed id'),
	ciphertext: z
		.string()
		.min(1)
		.max(64 * 1024)
		.regex(SEALED_PATTERN),
	payloadVersion: z.coerce.number().int().positive(),
	cost: creditsSchema,
	active: z.boolean(),
	expectedRevision: z.coerce.number().int().min(0).optional()
});

/**
 * The reward editor's fields as typed, before anything is sealed: what the
 * form validates in the browser. Never parsed on the server, which receives
 * `rewardSealedSubmitSchema` instead. The cost stays the string the field
 * holds, so an empty box is an empty string this can name rather than a 0
 * nobody typed. The description's length is checked when it is sealed, where
 * its visible text is counted (`rewardKind`).
 */
export const rewardEditorFormSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1, 'Please enter a title')
		.max(80, 'Please keep the title to 80 characters or fewer'),
	description: z.string(),
	cost: z.string().trim().regex(WHOLE_NUMBER, 'Please enter a whole number of credits'),
	active: z.boolean()
});

export type RewardEditorFormValues = z.output<typeof rewardEditorFormSchema>;

export const rewardClaimSchema = z.object({ rewardId: rewardIdSchema });

/** Setting a balance: whose, in which space, to what. */
export const rewardCreditsSchema = z.object({
	spaceId: z.string().uuid('Malformed space id'),
	targetUserId: userIdSchema,
	credits: creditsSchema
});

export type RewardCreditsSchema = typeof rewardCreditsSchema;
