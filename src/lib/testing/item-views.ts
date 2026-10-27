import type { RewardContent, TaskContent } from '../sealed-kinds/tasks';
import type { RewardView, TaskView } from '../types';
import { testSealedRef } from './sealed-refs';

/**
 * A task in the viewer's own space as a load hands it to a page, its content
 * sealed in a test record (`sealed-refs.ts`) that opens in a test file
 * mocking the reader's seams. The content is passed beside the view's own
 * fields, as a test thinks of the task. Only what a test is about needs
 * passing.
 */
export function testSelfTaskView(
	overrides: Partial<TaskView> & Partial<TaskContent> = {}
): TaskView {
	const now = new Date('2026-10-22T12:00:00.000Z');
	const { title = 'Stretch', description = null, completionMessages = [], ...view } = overrides;
	const id = view.id ?? crypto.randomUUID();
	return {
		id,
		spaceId: 'space-own',
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
		createdByMe: true,
		assigneeUserId: 'u1',
		canManage: true,
		canComplete: true,
		createdAt: now,
		updatedAt: now,
		timeZoneNote: null,
		...view
	};
}

/** As `testSelfTaskView`, for a task in a shared space; by default one the partner set for the viewer. */
export function testPartnershipTaskView(
	overrides: Partial<TaskView> & Partial<TaskContent> = {}
): TaskView {
	return testSelfTaskView({
		spaceId: 'space-shared',
		createdByMe: false,
		canManage: false,
		...overrides
	});
}

/** A reward in the viewer's own space as a load hands it to a page, sealed as `testSelfTaskView`'s. */
export function testSelfRewardView(
	overrides: Partial<RewardView> & Partial<RewardContent> = {}
): RewardView {
	const now = new Date('2026-10-22T12:00:00.000Z');
	const { title = 'Long bath', description = null, ...view } = overrides;
	const id = view.id ?? crypto.randomUUID();
	return {
		id,
		spaceId: 'space-own',
		sealed: testSealedRef({ title, description }, id),
		revision: 0,
		cost: 4,
		active: true,
		createdByMe: true,
		assigneeUserId: 'u1',
		canManage: true,
		canClaim: true,
		createdAt: now,
		updatedAt: now,
		...view
	};
}

/** As `testSelfRewardView`, for a reward in a shared space; by default one the partner set. */
export function testPartnershipRewardView(
	overrides: Partial<RewardView> & Partial<RewardContent> = {}
): RewardView {
	return testSelfRewardView({
		spaceId: 'space-shared',
		createdByMe: false,
		canManage: false,
		...overrides
	});
}
