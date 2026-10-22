import type {
	PartnershipRewardView,
	PartnershipTaskView,
	SelfRewardView,
	SelfTaskView
} from '../types';

/**
 * A self task as a load hands it to a page, plaintext (`sealed: null`) so a
 * component test can show its title without a vault. Only what a test is
 * about needs passing.
 */
export function testSelfTaskView(overrides: Partial<SelfTaskView> = {}): SelfTaskView {
	const now = new Date('2026-10-22T12:00:00.000Z');
	return {
		id: crypto.randomUUID(),
		title: 'Stretch',
		description: null,
		active: true,
		creditsAwarded: 2,
		completionMessages: [],
		sealed: null,
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
		...overrides
	};
}

/** As `testSelfTaskView`, for a partnership task; by default one the partner set. */
export function testPartnershipTaskView(
	overrides: Partial<PartnershipTaskView> = {}
): PartnershipTaskView {
	return {
		...testSelfTaskView(),
		createdByMe: false,
		canManage: false,
		...overrides
	};
}

/** A self reward as a load hands it to a page, plaintext, as `testSelfTaskView`. */
export function testSelfRewardView(overrides: Partial<SelfRewardView> = {}): SelfRewardView {
	const now = new Date('2026-10-22T12:00:00.000Z');
	return {
		id: crypto.randomUUID(),
		title: 'Long bath',
		description: null,
		sealed: null,
		revision: 0,
		cost: 4,
		active: true,
		canClaim: true,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
}

/** As `testSelfRewardView`, for a partnership reward; by default one the partner set. */
export function testPartnershipRewardView(
	overrides: Partial<PartnershipRewardView> = {}
): PartnershipRewardView {
	return { ...testSelfRewardView(), createdByMe: false, ...overrides };
}
