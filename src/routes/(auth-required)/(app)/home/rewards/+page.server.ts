import { error, fail } from '@sveltejs/kit';
import {
	partnerRewardClaimSchema,
	rewardClaimSchema,
	rewardCreditsSchema
} from '$lib/schemas/rewardForm';
import {
	claimPartnershipReward,
	claimSelfReward,
	setSelfRewardCredits,
	updateSelfRewardContent
} from '$lib/server/rewards';
import { malformedSealed, readSealedRewardContent, sealedRefusal } from '$lib/server/sealed-submit';
import type { Actions } from './$types';

function stringField(formData: FormData, key: string): string | undefined {
	const value = formData.get(key);
	return typeof value === 'string' ? value : undefined;
}

function numberField(formData: FormData, key: string): string | undefined {
	const value = stringField(formData, key);
	return value === '' ? undefined : value;
}

function firstError(
	fieldErrors: Record<string, string[] | undefined>,
	formErrors: string[]
): string {
	for (const errorList of Object.values(fieldErrors)) {
		if (errorList?.[0]) {
			return errorList[0];
		}
	}
	return formErrors[0] ?? 'Please check the form and try again.';
}

export const actions: Actions = {
	selfSetCredits: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}

		const formData = await request.formData();
		const parsed = rewardCreditsSchema.safeParse({
			targetUserId: locals.user.id,
			credits: numberField(formData, 'credits')
		});
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, {
				action: 'selfSetCredits',
				error: firstError(flat.fieldErrors, flat.formErrors)
			});
		}

		await setSelfRewardCredits(locals.db, locals.user.id, parsed.data.credits);
		return { action: 'selfSetCredits', message: 'Reward credits updated.' };
	},

	selfClaimReward: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}

		const formData = await request.formData();
		const parsed = rewardClaimSchema.safeParse({ rewardId: stringField(formData, 'rewardId') });
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, {
				action: 'selfClaimReward',
				error: firstError(flat.fieldErrors, flat.formErrors)
			});
		}

		const result = await claimSelfReward(locals.db, locals.user.id, parsed.data.rewardId);
		if (!result.ok) {
			if (result.reason === 'not-found') {
				error(404, 'Reward not found');
			}
			return fail(400, {
				action: 'selfClaimReward',
				error:
					result.reason === 'inactive'
						? 'That reward is inactive right now.'
						: 'You do not have enough reward credits for that claim.'
			});
		}

		return { action: 'selfClaimReward', message: 'Reward claimed.' };
	},

	partnerClaimReward: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}

		const formData = await request.formData();
		const parsed = partnerRewardClaimSchema.safeParse({
			partnershipId: stringField(formData, 'partnershipId'),
			rewardId: stringField(formData, 'rewardId')
		});
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, {
				action: 'partnerClaimReward',
				error: firstError(flat.fieldErrors, flat.formErrors)
			});
		}

		const result = await claimPartnershipReward(locals.db, {
			partnershipId: parsed.data.partnershipId,
			rewardId: parsed.data.rewardId,
			userId: locals.user.id
		});
		if (!result.ok) {
			if (result.reason === 'not-a-member' || result.reason === 'not-found') {
				error(404, 'Reward not found');
			}
			if (result.reason === 'not-allowed' || result.reason === 'own-reward') {
				return fail(403, {
					action: 'partnerClaimReward',
					error: 'You cannot claim that reward from this side of the partnership.'
				});
			}
			return fail(400, {
				action: 'partnerClaimReward',
				error:
					result.reason === 'inactive'
						? 'That reward is inactive right now.'
						: 'You do not have enough reward credits for that claim.'
			});
		}

		return { action: 'partnerClaimReward', message: 'Reward claimed.' };
	},

	/**
	 * A self reward's description with a to-do item ticked or unticked: its
	 * sealed content alone, from the reward's sheet (docs/rich-text.md, "To-do
	 * lists").
	 */
	selfRewardContent: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const submitted = await readSealedRewardContent(request);
		if (!submitted) {
			return malformedSealed('reward');
		}
		const result = await updateSelfRewardContent(locals.db, locals.user.id, submitted.recordId, {
			content: submitted.content,
			expectedRevision: submitted.expectedRevision
		});
		if (!result.ok) {
			if (result.reason === 'not-found') {
				error(404, 'Reward not found');
			}
			return sealedRefusal(result.reason, 'reward');
		}
		return { saved: true };
	}
};
