import { error, fail } from '@sveltejs/kit';
import { rewardClaimSchema, rewardCreditsSchema } from '$lib/schemas/rewardForm';
import { claimReward, setRewardBalance, updateRewardContent } from '$lib/server/rewards';
import { malformedSealed, readSealedRewardContent, sealedRefusal } from '$lib/server/sealed-submit';
import type { Actions } from './$types';

/**
 * The list's actions. Each names the reward, or the space and member of a
 * balance, and the server checks the viewer's place there — never the
 * context (docs/contexts.md, "Writes name their space").
 */

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
	/** A balance set by hand: the viewer's own in their own space, or a partner's they manage. */
	setCredits: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const formData = await request.formData();
		const parsed = rewardCreditsSchema.safeParse({
			spaceId: stringField(formData, 'spaceId'),
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
		const result = await setRewardBalance(
			locals.db,
			locals.user.id,
			parsed.data.spaceId,
			parsed.data.targetUserId,
			parsed.data.credits
		);
		if (!result.ok) {
			if (result.reason === 'not-a-member') {
				error(404, 'Not found');
			}
			return fail(403, {
				action: 'setCredits',
				error: 'Those credits are not yours to set.'
			});
		}
		return { action: 'setCredits', message: 'Reward credits updated.' };
	},

	claim: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const formData = await request.formData();
		const parsed = rewardClaimSchema.safeParse({ rewardId: stringField(formData, 'rewardId') });
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, { action: 'claim', error: firstError(flat.fieldErrors, flat.formErrors) });
		}
		const result = await claimReward(locals.db, locals.user.id, parsed.data.rewardId);
		if (!result.ok) {
			if (result.reason === 'not-found') {
				error(404, 'Reward not found');
			}
			if (result.reason === 'not-allowed') {
				return fail(403, { action: 'claim', error: 'That reward is not yours to claim.' });
			}
			return fail(400, {
				action: 'claim',
				error:
					result.reason === 'inactive'
						? 'That reward is inactive right now.'
						: 'You do not have enough reward credits for that claim.'
			});
		}
		return { action: 'claim', message: 'Reward claimed.' };
	},

	/**
	 * A reward's description with a to-do item ticked or unticked: its sealed
	 * content alone, from the reward's sheet, under the permission to edit it
	 * (docs/rich-text.md, "To-do lists").
	 */
	content: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const submitted = await readSealedRewardContent(request);
		if (!submitted) {
			return malformedSealed('reward');
		}
		const result = await updateRewardContent(locals.db, locals.user.id, submitted.recordId, {
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
