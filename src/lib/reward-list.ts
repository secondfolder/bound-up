/**
 * How a list of rewards is arranged, worked out away from the markup so it
 * can be tested in node. See docs/rewards.md, "The wallet".
 */
import type { ContentSaveTarget } from './description-ticks';
import type { PartnershipRewardView, SelfRewardView } from './types';

export type RewardView = SelfRewardView | PartnershipRewardView;

/**
 * One reward as a list shows it, with what the list needs to act on it.
 */
export type RewardEntry = {
	reward: RewardView;
	/** The form action that claims it, or null when the viewer does not claim it. */
	claimAction: string | null;
	/** Posted with the claim, for a partnership reward claimed from `/home/rewards`. */
	partnershipId?: string | null;
	/** Its edit page, when the viewer may edit it. */
	editHref?: string | null;
	/** Where ticking a to-do item in its description saves, beside `editHref`. */
	contentSave?: ContentSaveTarget | null;
	/** The whole list it comes from, from a page that shows several. */
	listHref?: string | null;
	/** Whose list that is, to name the link. */
	listOwner?: string | null;
};

/**
 * Which way round the viewer stands to a list. `claim`: theirs to spend on.
 * `set`: rewards they set for their partner, against the partner's balance.
 */
export type RewardListMode = 'claim' | 'set';

type GroupableReward = { active: boolean; cost: number };

/**
 * A wallet's rewards: what the balance covers now (cheapest first), what it
 * is still short of (closest first), and what is inactive.
 *
 * Decided against the balance rather than `canClaim`, so it reads the same
 * from either side of a partnership: the side that set a reward never claims
 * it, but still wants to see whether their partner can.
 */
export function groupRewards<T extends GroupableReward>(
	rewards: T[],
	balance: number
): { affordable: T[]; saving: T[]; inactive: T[] } {
	return {
		affordable: rewards
			.filter((reward) => reward.active && reward.cost <= balance)
			.sort((a, b) => a.cost - b.cost),
		saving: rewards
			.filter((reward) => reward.active && reward.cost > balance)
			.sort((a, b) => a.cost - b.cost),
		inactive: rewards.filter((reward) => !reward.active)
	};
}

/** How far a balance is towards a cost, 0–100. */
export function progressTowards(cost: number, balance: number): number {
	if (cost <= 0) {
		return 100;
	}
	return Math.max(0, Math.min(100, Math.floor((balance / cost) * 100)));
}

/**
 * The line under a reward the balance does not cover yet: "6 more" to
 * whoever claims it, "Jun needs 6 more" to whoever set it.
 */
export function shortfallText(
	cost: number,
	balance: number,
	mode: RewardListMode,
	partnerName: string | null = null
): string | null {
	const short = cost - balance;
	if (short <= 0) {
		return null;
	}
	const more = `${short} more`;
	return mode === 'set' && partnerName ? `${partnerName} needs ${more}` : more;
}
