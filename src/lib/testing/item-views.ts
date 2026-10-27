import type { RewardContent, TaskContent } from '../sealed-kinds/tasks';
import type {
	PartnershipRewardView,
	PartnershipTaskView,
	SelfRewardView,
	SelfTaskView
} from '../types';
import { testSealedRef } from './sealed-refs';

/**
 * A self task as a load hands it to a page, its content sealed in a test
 * record (`sealed-refs.ts`) that opens in a test file mocking the reader's
 * seams. The content is passed beside the view's own fields, as a test thinks
 * of the task. Only what a test is about needs passing.
 */
export function testSelfTaskView(
	overrides: Partial<SelfTaskView> & Partial<TaskContent> = {}
): SelfTaskView {
	const now = new Date('2026-10-22T12:00:00.000Z');
	const { title = 'Stretch', description = null, completionMessages = [], ...view } = overrides;
	const id = view.id ?? crypto.randomUUID();
	return {
		id,
		active: true,
		creditsAwarded: 2,
		sealed: testSealedRef({ title, description, completionMessages }, id),
		revision: 0,
		schedule: { mode: 'one-off' },
		timezoneOwnerUserId: 'u1',
		lastCompletedAt: null,
		completedCount: 0,
		nextEligibleAt: null,
		windowCompletions: null,
		canComplete: true,
		createdAt: now,
		updatedAt: now,
		timeZoneNote: null,
		...view
	};
}

/** As `testSelfTaskView`, for a partnership task; by default one the partner set. */
export function testPartnershipTaskView(
	overrides: Partial<PartnershipTaskView> & Partial<TaskContent> = {}
): PartnershipTaskView {
	const { createdByMe = false, canManage = false, ...rest } = overrides;
	return { ...testSelfTaskView(rest), createdByMe, canManage };
}

/** A self reward as a load hands it to a page, its content sealed as `testSelfTaskView`'s. */
export function testSelfRewardView(
	overrides: Partial<SelfRewardView> & Partial<RewardContent> = {}
): SelfRewardView {
	const now = new Date('2026-10-22T12:00:00.000Z');
	const { title = 'Long bath', description = null, ...view } = overrides;
	const id = view.id ?? crypto.randomUUID();
	return {
		id,
		sealed: testSealedRef({ title, description }, id),
		revision: 0,
		cost: 4,
		active: true,
		canClaim: true,
		createdAt: now,
		updatedAt: now,
		...view
	};
}

/** As `testSelfRewardView`, for a partnership reward; by default one the partner set. */
export function testPartnershipRewardView(
	overrides: Partial<PartnershipRewardView> & Partial<RewardContent> = {}
): PartnershipRewardView {
	const { createdByMe = false, ...rest } = overrides;
	return { ...testSelfRewardView(rest), createdByMe };
}
