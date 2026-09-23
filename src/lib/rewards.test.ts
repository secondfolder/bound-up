import { describe, expect, it } from 'vitest';
import type { PartnershipRecord } from './partnership';
import {
	canClaimFromPartnership,
	canClaimPartnershipReward,
	canManagePartnershipRewards,
	canSetPartnershipCredits,
	type PartnershipRewardRecord
} from './rewards';

const INVITER = 'user-inviter';
const INVITEE = 'user-invitee';
const STRANGER = 'user-stranger';

function partnership(overrides: Partial<PartnershipRecord> = {}): PartnershipRecord {
	return {
		id: 'p1',
		status: 'accepted',
		inviterId: INVITER,
		inviteeId: INVITEE,
		inviterName: 'Ada',
		inviteeName: 'Jun',
		inviterRole: null,
		inviteeRole: null,
		control: 'both',
		...overrides
	};
}

function reward(overrides: Partial<PartnershipRewardRecord> = {}): PartnershipRewardRecord {
	return {
		...partnership(),
		partnershipId: 'p1',
		createdByUserId: INVITER,
		active: true,
		cost: 3,
		...overrides
	};
}

describe('canManagePartnershipRewards', () => {
	it('matches the existing control rule', () => {
		expect(canManagePartnershipRewards(partnership({ control: 'both' }), INVITER)).toBe(true);
		expect(canManagePartnershipRewards(partnership({ control: 'both' }), INVITEE)).toBe(true);
		expect(canManagePartnershipRewards(partnership({ control: 'inviter' }), INVITER)).toBe(true);
		expect(canManagePartnershipRewards(partnership({ control: 'inviter' }), INVITEE)).toBe(false);
	});
});

describe('canClaimFromPartnership', () => {
	it('lets the non-controller claim when control is one-sided', () => {
		expect(canClaimFromPartnership(partnership({ control: 'inviter' }), INVITEE)).toBe(true);
		expect(canClaimFromPartnership(partnership({ control: 'inviter' }), INVITER)).toBe(false);
		expect(canClaimFromPartnership(partnership({ control: 'invitee' }), INVITER)).toBe(true);
		expect(canClaimFromPartnership(partnership({ control: 'invitee' }), INVITEE)).toBe(false);
	});

	it('lets both members claim under shared control', () => {
		expect(canClaimFromPartnership(partnership({ control: 'both' }), INVITER)).toBe(true);
		expect(canClaimFromPartnership(partnership({ control: 'both' }), INVITEE)).toBe(true);
	});

	it('refuses pending links and strangers', () => {
		expect(
			canClaimFromPartnership(partnership({ status: 'pending', inviteeId: null }), INVITER)
		).toBe(false);
		expect(canClaimFromPartnership(partnership(), STRANGER)).toBe(false);
	});
});

describe('canSetPartnershipCredits', () => {
	it("lets the controller set only the other person's credits", () => {
		const row = partnership({ control: 'inviter' });
		expect(canSetPartnershipCredits(row, INVITER, INVITEE)).toBe(true);
		expect(canSetPartnershipCredits(row, INVITER, INVITER)).toBe(false);
		expect(canSetPartnershipCredits(row, INVITEE, INVITER)).toBe(false);
	});

	it('keeps the same rule under shared control', () => {
		const row = partnership({ control: 'both' });
		expect(canSetPartnershipCredits(row, INVITER, INVITEE)).toBe(true);
		expect(canSetPartnershipCredits(row, INVITEE, INVITER)).toBe(true);
	});
});

describe('canClaimPartnershipReward', () => {
	it('blocks the author even under shared control', () => {
		expect(
			canClaimPartnershipReward(reward({ control: 'both', createdByUserId: INVITER }), INVITER, 10)
		).toBe(false);
	});

	it('lets the other member claim when control allows it and credits are enough', () => {
		expect(
			canClaimPartnershipReward(
				reward({ control: 'invitee', createdByUserId: INVITEE }),
				INVITER,
				3
			)
		).toBe(true);
		expect(
			canClaimPartnershipReward(reward({ control: 'both', createdByUserId: INVITEE }), INVITER, 3)
		).toBe(true);
	});

	it('rejects inactive rewards and insufficient credits', () => {
		expect(canClaimPartnershipReward(reward({ active: false }), INVITEE, 10)).toBe(false);
		expect(canClaimPartnershipReward(reward({ cost: 4 }), INVITEE, 3)).toBe(false);
	});
});
