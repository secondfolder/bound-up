import { describe, expect, it } from 'vitest';
import type { PartnershipControl } from './partnership';
import { canClaimReward, type RewardRuleRecord, rewardListFor } from './rewards';
import { managersFromControl, type SpaceForRules } from './spaces';

const ADA = 'ada';
const JUN = 'jun';

function shared(control: PartnershipControl): SpaceForRules {
	return {
		kind: 'shared',
		members: managersFromControl(control, { inviterId: ADA, inviteeId: JUN })
	};
}

const solo: SpaceForRules = { kind: 'solo', members: [{ userId: ADA, canManage: true }] };

/** A reward Ada wrote for Jun, unless told otherwise. */
function reward(overrides: Partial<RewardRuleRecord> = {}): RewardRuleRecord {
	return { createdByUserId: ADA, assigneeUserId: JUN, active: true, cost: 3, ...overrides };
}

describe('rewardListFor', () => {
	it('puts your own rewards in your own wallet', () => {
		expect(rewardListFor(reward({ assigneeUserId: ADA }), solo, ADA)).toBe('claim');
	});

	it('puts a reward set for you in your wallet, and in the setter’s set-for-others', () => {
		expect(rewardListFor(reward(), shared('inviter'), JUN)).toBe('claim');
		expect(rewardListFor(reward(), shared('inviter'), ADA)).toBe('set');
	});

	it('keeps the authorship rule under shared control', () => {
		expect(rewardListFor(reward(), shared('both'), ADA)).toBe('set');
		expect(rewardListFor(reward(), shared('both'), JUN)).toBe('claim');
	});

	it('hides a reward a change of manager left on the wrong side', () => {
		expect(rewardListFor(reward(), shared('invitee'), JUN)).toBeNull();
		expect(rewardListFor(reward(), shared('invitee'), ADA)).toBeNull();
	});
});

describe('canClaimReward', () => {
	it('lets the person it is for claim it when they can afford it', () => {
		expect(canClaimReward(reward(), shared('inviter'), JUN, 3)).toBe(true);
		expect(canClaimReward(reward(), shared('inviter'), JUN, 2)).toBe(false);
		expect(canClaimReward(reward({ assigneeUserId: ADA }), solo, ADA, 3)).toBe(true);
	});

	it('never lets the author claim their own reward, even under shared control', () => {
		expect(canClaimReward(reward(), shared('both'), ADA, 99)).toBe(false);
	});

	it('refuses an inactive reward', () => {
		expect(canClaimReward(reward({ active: false }), shared('inviter'), JUN, 99)).toBe(false);
	});

	it('refuses the side that only sets rewards', () => {
		// Jun is the reward's assignee, but Jun manages alone now.
		expect(canClaimReward(reward(), shared('invitee'), JUN, 99)).toBe(false);
	});
});
