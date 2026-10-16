import { error, fail } from '@sveltejs/kit';
import { rewardClaimSchema, rewardCreditsSchema } from '$lib/schemas/rewardForm';
import {
	claimPartnershipReward,
	getPartnershipRewardsPage,
	setPartnershipRewardCredits
} from '$lib/server/rewards';
import type { Actions, PageServerLoad } from './$types';

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

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	depends(`rewards:partner:${params.id}`);

	const page = await getPartnershipRewardsPage(locals.db, params.id, locals.user.id);
	if (!page) {
		error(404, 'Partner not found');
	}
	return page;
};

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
	}
};
