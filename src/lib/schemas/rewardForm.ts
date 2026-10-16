import { z } from 'zod';
import { SEALED_PATTERN } from '$lib/sealed';
import { isClientId } from '$lib/vault';

const creditsSchema = z.coerce
	.number()
	.int('Please enter a whole number')
	.min(0, 'Credits cannot be negative');

const rewardIdSchema = z.string().uuid('Malformed reward id');

const userIdSchema = z.string().trim().min(1, 'Malformed user id');

/**
 * What a reward form actually posts: the cost and whether it is active, which
 * the server checks claims against, and the title and description sealed into
 * the scope's vault in place of the text fields (`sealRewardSubmission` in
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

export const rewardClaimSchema = z.object({ rewardId: rewardIdSchema });

export const partnerRewardClaimSchema = rewardClaimSchema.extend({
	partnershipId: z.string().uuid('Malformed partnership id')
});

export const rewardCreditsSchema = z.object({
	targetUserId: userIdSchema,
	credits: creditsSchema
});

export type RewardCreditsSchema = typeof rewardCreditsSchema;
