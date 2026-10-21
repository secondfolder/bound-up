/**
 * How credits are worded wherever tasks and rewards show them.
 *
 * Alias-free and pure, so the wording has one home and a node test: it used
 * to be spelled out at each site, and the reward cards said "1 credits" while
 * the task cards beside them pluralised correctly.
 */

/** "1 credit", "3 credits". */
export function creditsLabel(credits: number): string {
	return `${credits} credit${credits === 1 ? '' : 's'}`;
}

/** A task's award, signed because it is something you gain: "+1 credit". */
export function creditAwardLabel(credits: number): string {
	return `+${creditsLabel(credits)}`;
}

/** What a reward card needs to say about whether it can be claimed. */
export type RewardClaimState = {
	active: boolean;
	canClaim: boolean;
	cost: number;
};

/**
 * The line under a reward that cannot be claimed right now, or null when
 * there is nothing to add.
 *
 * Says how far short the balance is, not what the reward costs: the cost is
 * already beside the button, and "You need 8 credits." read as if it were news
 * to someone holding 3. Nothing is said for a claimable reward — the claim
 * button turning amber is the message — nor when the balance is unknown or
 * already covers the cost, because then something other than credits is what
 * stands in the way and the server's refusal will say what.
 */
export function rewardClaimStatus(reward: RewardClaimState, balance: number | null): string | null {
	if (!reward.active) {
		return 'Inactive right now.';
	}
	if (reward.canClaim || balance === null || balance >= reward.cost) {
		return null;
	}
	const shortfall = reward.cost - balance;
	return `${shortfall} more credit${shortfall === 1 ? '' : 's'} to go`;
}
