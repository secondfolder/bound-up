import { describe, expect, it } from 'vitest';
import { creditAwardLabel, creditsLabel, rewardClaimStatus } from './credits';

describe('creditsLabel', () => {
	it('pluralises everything but one', () => {
		expect(creditsLabel(0)).toBe('0 credits');
		expect(creditsLabel(1)).toBe('1 credit');
		expect(creditsLabel(8)).toBe('8 credits');
	});

	it('signs an award', () => {
		expect(creditAwardLabel(1)).toBe('+1 credit');
		expect(creditAwardLabel(2)).toBe('+2 credits');
	});
});

describe('rewardClaimStatus', () => {
	const reward = { active: true, canClaim: false, cost: 8 };

	it('says how far short the balance is, not what the reward costs', () => {
		expect(rewardClaimStatus(reward, 3)).toBe('5 more credits to go');
		expect(rewardClaimStatus(reward, 7)).toBe('1 more credit to go');
	});

	it('says nothing for a reward that can be claimed', () => {
		expect(rewardClaimStatus({ ...reward, canClaim: true }, 10)).toBeNull();
	});

	it('says an inactive reward is inactive, whatever the balance', () => {
		expect(rewardClaimStatus({ ...reward, active: false }, 0)).toBe('Inactive right now.');
		expect(rewardClaimStatus({ ...reward, active: false, canClaim: true }, 10)).toBe(
			'Inactive right now.'
		);
	});

	it('does not invent a shortfall when credits are not what is in the way', () => {
		expect(rewardClaimStatus(reward, null)).toBeNull();
		expect(rewardClaimStatus(reward, 8)).toBeNull();
	});
});
