import { type AssignedRecord, actsOn, managesRecord, type SpaceForRules } from './spaces';

/**
 * The editable fields on a reward: the cost and whether it is active, which
 * the server checks claims against, and the title and description sealed in
 * its space's vault (`rewardKind`).
 */
export type RewardInput = {
	cost: number;
	active: boolean;
	content: { vaultId: string; ciphertext: string; payloadVersion: number };
};

/** A reward as its rules see it. */
export type RewardRuleRecord = AssignedRecord & { active: boolean; cost: number };

/**
 * Whether the viewer may claim this reward with the credits they have in its
 * space: it is theirs to claim (`actsOn` — set for them, on the side that
 * acts, and never one they wrote, so nobody spends credits on their own
 * reward), it is active, and the balance covers it. See docs/rewards.md.
 */
export function canClaimReward(
	record: RewardRuleRecord,
	space: SpaceForRules,
	viewerId: string,
	availableCredits: number
): boolean {
	return actsOn(record, space, viewerId) && record.active && availableCredits >= record.cost;
}

/**
 * Which side of a rewards page a reward is on for this viewer: `claim`, the
 * wallets they spend from, or `set`, the ones they keep for someone else in a
 * shared space they manage. Null hides it, as `taskListFor` does.
 */
export function rewardListFor(
	record: AssignedRecord,
	space: SpaceForRules,
	viewerId: string
): 'claim' | 'set' | null {
	if (actsOn(record, space, viewerId)) {
		return 'claim';
	}
	if (space.kind === 'shared' && managesRecord(record, space, viewerId)) {
		return 'set';
	}
	return null;
}
