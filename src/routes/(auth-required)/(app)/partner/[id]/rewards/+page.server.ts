import { error, fail } from '@sveltejs/kit';
import { rewardClaimSchema, rewardCreditsSchema } from '$lib/schemas/rewardForm';
import {
	claimPartnershipReward,
	setPartnershipRewardCredits,
	updatePartnershipRewardContent
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
	setCredits: async ({ locals, params, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}

		const formData = await request.formData();
		const parsed = rewardCreditsSchema.safeParse({
			targetUserId: stringField(formData, 'targetUserId'),
			credits: numberField(formData, 'credits')
		});
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, {
				action: 'setCredits',
				error: firstError(flat.fieldErrors, flat.formErrors)
			});
		}

		const result = await setPartnershipRewardCredits(
			locals.db,
			params.id,
			locals.user.id,
			parsed.data.targetUserId,
			parsed.data.credits
		);
		if (!result.ok) {
			if (result.reason === 'not-a-member') {
				error(404, 'Partner not found');
			}
			if (result.reason === 'forbidden') {
				return fail(403, {
					action: 'setCredits',
					error: 'Only the controlling side can set reward credits.'
				});
			}
			return fail(400, {
				action: 'setCredits',
				error: 'That credit update does not match this partnership.'
			});
		}

		return { action: 'setCredits', message: 'Reward credits updated.' };
	},

	claimReward: async ({ locals, params, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}

		const formData = await request.formData();
		const parsed = rewardClaimSchema.safeParse({ rewardId: stringField(formData, 'rewardId') });
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, {
				action: 'claimReward',
				error: firstError(flat.fieldErrors, flat.formErrors)
			});
		}

		const result = await claimPartnershipReward(locals.db, {
			partnershipId: params.id,
			rewardId: parsed.data.rewardId,
			userId: locals.user.id
		});
		if (!result.ok) {
			if (result.reason === 'not-a-member') {
				error(404, 'Partner not found');
			}
			if (result.reason === 'not-found') {
				error(404, 'Reward not found');
			}
			if (result.reason === 'not-allowed' || result.reason === 'own-reward') {
				return fail(403, {
					action: 'claimReward',
					error: 'You cannot claim that reward from this side of the partnership.'
				});
			}
			return fail(400, {
				action: 'claimReward',
				error:
					result.reason === 'inactive'
						? 'That reward is inactive right now.'
						: 'You do not have enough reward credits for that claim.'
			});
		}

		return { action: 'claimReward', message: 'Reward claimed.' };
	},

	/**
	 * A reward's description with a to-do item ticked or unticked, as
	 * `selfRewardContent` on `/home/rewards`, under the permission to edit it.
	 */
	rewardContent: async ({ locals, params, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const submitted = await readSealedRewardContent(request);
		if (!submitted) {
			return malformedSealed('reward');
		}
		const result = await updatePartnershipRewardContent(
			locals.db,
			params.id,
			locals.user.id,
			submitted.recordId,
			{ content: submitted.content, expectedRevision: submitted.expectedRevision }
		);
		if (!result.ok) {
			if (result.reason === 'not-a-member') {
				error(404, 'Partner not found');
			}
			if (result.reason === 'not-found') {
				error(404, 'Reward not found');
			}
			return sealedRefusal(result.reason, 'reward');
		}
		return { saved: true };
	}
};
