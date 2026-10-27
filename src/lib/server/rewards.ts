import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PartnerNamesSource } from '../partnership';
import { canClaimReward, type RewardInput, rewardListFor } from '../rewards';
import { rewardKind } from '../sealed-kinds/tasks';
import { assigneeFor, canSetBalance, managesRecord, managesSpace, viewerActsIn } from '../spaces';
import type {
	ItemSpaceView,
	RewardClaimView,
	RewardsListView,
	RewardsWidgetView,
	RewardView,
	RewardWalletView,
	WidgetBalanceView
} from '../types';
import type { Db } from './db';
import { rewardBalances, rewardClaims, rewards } from './db/schema';
import { sealedIsAcceptable, sealedRef, snapshotRef, vaultIdForSpace } from './sealed-content';
import { type ItemSpace, loadItemSpace, loadItemSpaces } from './spaces';
import {
	balancesFor,
	type ContentRefusal,
	readBalance,
	readBalances,
	toItemSpaceView
} from './tasks';

/**
 * Rewards: one code path for every space, as tasks have. See docs/rewards.md.
 *
 * A reward is in a space, written by one member and claimed by the one it is
 * for (`assigneeUserId`), from that member's balance in the same space. The
 * rules are pure, in `src/lib/spaces.ts` and `src/lib/rewards.ts`. Every write
 * names its reward or its space and checks membership of it here, never the
 * current context.
 */

/** As `tasksDependency`, for a space's reward lists and cards. */
export function rewardsDependency(spaceId: string): `rewards:${string}` {
	return `rewards:${spaceId}`;
}

const rewardColumns = {
	id: rewards.id,
	spaceId: rewards.spaceId,
	createdByUserId: rewards.createdByUserId,
	assigneeUserId: rewards.assigneeUserId,
	ciphertext: rewards.ciphertext,
	vaultId: rewards.vaultId,
	payloadVersion: rewards.payloadVersion,
	revision: rewards.revision,
	cost: rewards.cost,
	active: rewards.active,
	createdAt: rewards.createdAt,
	updatedAt: rewards.updatedAt
} as const;

type RewardRecord = {
	id: string;
	spaceId: string;
	createdByUserId: string;
	assigneeUserId: string | null;
	ciphertext: string;
	vaultId: string;
	payloadVersion: number;
	revision: number;
	cost: number;
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
};

type RewardResult<TReason extends string> = { ok: true } | { ok: false; reason: TReason };

type CreateRewardResult<TReason extends string> =
	| { ok: true; id: string }
	| { ok: false; reason: TReason };

/** As `taskContentProblem` in tasks.ts, for the reward kind. */
function rewardContentProblem(
	content: RewardInput['content'],
	vaultId: string | null
): ContentRefusal | null {
	if (!sealedIsAcceptable(rewardKind, content.ciphertext, content.payloadVersion)) {
		return 'bad-content';
	}
	return content.vaultId === vaultId ? null : 'wrong-vault';
}

/** The columns a sealed reward write sets. */
function sealedRewardColumns(content: RewardInput['content'], revision: number) {
	return {
		ciphertext: content.ciphertext,
		vaultId: content.vaultId,
		payloadVersion: content.payloadVersion,
		revision
	};
}

/** `credits` is what the viewer holds in the reward's space, which decides `canClaim`. */
function toRewardView(
	row: RewardRecord,
	space: ItemSpace,
	viewerId: string,
	credits: number
): RewardView {
	return {
		id: row.id,
		spaceId: row.spaceId,
		sealed: sealedRef(row.id, row),
		revision: row.revision,
		cost: row.cost,
		active: row.active,
		createdByMe: row.createdByUserId === viewerId,
		assigneeUserId: row.assigneeUserId,
		canManage: managesRecord(row, space, viewerId),
		canClaim: canClaimReward(row, space, viewerId, credits),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

/** The spaces of a context, in the order given, that the viewer is in. */
async function spacesInOrder(
	db: Db,
	viewerId: string,
	spaceIds: readonly string[]
): Promise<ItemSpace[]> {
	const found = await loadItemSpaces(db, viewerId, spaceIds);
	return spaceIds.flatMap((id) => {
		const space = found.get(id);
		return space ? [space] : [];
	});
}

/**
 * A rewards page for the spaces a context shows: a wallet per balance, never
 * merged, because each reward is paid from exactly one. The viewer's own
 * wallets first (the rewards set for them), then one for each partner whose
 * rewards they manage (the ones they set for that partner). See
 * docs/rewards.md, "The wallet".
 */
export async function listRewards(
	db: Db,
	viewerId: string,
	spaceIds: readonly string[]
): Promise<RewardsListView> {
	const spaces = await spacesInOrder(db, viewerId, spaceIds);
	const ids = spaces.map((space) => space.id);
	if (ids.length === 0) {
		return { spaces: [], wallets: [] };
	}
	const [rows, credits] = await Promise.all([
		db
			.select(rewardColumns)
			.from(rewards)
			.where(inArray(rewards.spaceId, ids))
			.orderBy(desc(rewards.active), desc(rewards.createdAt), asc(rewards.id)),
		readBalances(db, ids)
	]);
	const bySpace = new Map(spaces.map((space) => [space.id, space]));
	const viewerCredits = new Map(
		credits.filter((row) => row.userId === viewerId).map((row) => [row.spaceId, row.credits])
	);
	const wallets: RewardWalletView[] = balancesFor(spaces, viewerId, credits).map((balance) => ({
		...balance,
		rewards: []
	}));
	const walletOf = (spaceId: string, userId: string | null) =>
		wallets.find((wallet) => wallet.spaceId === spaceId && wallet.userId === userId);
	for (const row of rows) {
		const space = bySpace.get(row.spaceId);
		if (!(space && rewardListFor(row, space, viewerId))) {
			continue;
		}
		walletOf(row.spaceId, row.assigneeUserId)?.rewards.push(
			toRewardView(row, space, viewerId, viewerCredits.get(row.spaceId) ?? 0)
		);
	}
	// The viewer's own first, so what they can spend comes before what they keep for others.
	return {
		spaces: spaces.map((space) => toItemSpaceView(space, viewerId)),
		wallets: [
			...wallets.filter((wallet) => wallet.mine),
			...wallets.filter((wallet) => !wallet.mine)
		]
	};
}

/** Every claim in the spaces a context shows, newest first: the history sheet. */
export async function listRewardClaims(
	db: Db,
	viewerId: string,
	spaceIds: readonly string[]
): Promise<RewardClaimView[]> {
	const spaces = await spacesInOrder(db, viewerId, spaceIds);
	if (spaces.length === 0) {
		return [];
	}
	const rows = await db
		.select({
			id: rewardClaims.id,
			spaceId: rewardClaims.spaceId,
			claimedByUserId: rewardClaims.claimedByUserId,
			createdByUserId: rewardClaims.createdByUserId,
			rewardCost: rewardClaims.rewardCost,
			snapshotCiphertext: rewardClaims.snapshotCiphertext,
			snapshotVaultId: rewardClaims.snapshotVaultId,
			snapshotVersion: rewardClaims.snapshotVersion,
			snapshotRecordId: rewardClaims.snapshotRecordId,
			createdAt: rewardClaims.createdAt
		})
		.from(rewardClaims)
		.where(
			inArray(
				rewardClaims.spaceId,
				spaces.map((space) => space.id)
			)
		)
		.orderBy(desc(rewardClaims.createdAt), desc(rewardClaims.id));
	return rows.map((row) => ({
		id: row.id,
		spaceId: row.spaceId,
		rewardCost: row.rewardCost,
		createdAt: row.createdAt,
		sealed: snapshotRef(row),
		mine: row.claimedByUserId === viewerId,
		createdByMe: row.createdByUserId === viewerId
	}));
}

async function rewardInViewersSpace(
	db: Db,
	viewerId: string,
	rewardId: string
): Promise<{ reward: RewardRecord; space: ItemSpace } | null> {
	const [reward] = await db
		.select(rewardColumns)
		.from(rewards)
		.where(eq(rewards.id, rewardId))
		.limit(1);
	if (!reward) {
		return null;
	}
	const space = await loadItemSpace(db, viewerId, reward.spaceId);
	return space ? { reward, space } : null;
}

/**
 * One reward as the viewer sees it, with its space: what its edit sheet
 * opens. Null for one that does not exist or is in a space the viewer is not
 * in, which the routes answer alike with a 404.
 */
export async function getRewardForViewer(
	db: Db,
	viewerId: string,
	rewardId: string
): Promise<{ reward: RewardView; space: ItemSpaceView } | null> {
	const found = await rewardInViewersSpace(db, viewerId, rewardId);
	if (!found) {
		return null;
	}
	return {
		reward: toRewardView(
			found.reward,
			found.space,
			viewerId,
			await readBalance(db, found.reward.spaceId, viewerId)
		),
		space: toItemSpaceView(found.space, viewerId)
	};
}

/**
 * Creates a reward in the space the form names, for the member `assigneeFor`
 * picks — the viewer in their own space, their partner in a shared one — by
 * someone who manages the space. `rewardId` comes from the browser.
 */
export async function createReward(
	db: Db,
	viewerId: string,
	spaceId: string,
	rewardId: string,
	input: RewardInput
): Promise<CreateRewardResult<'not-a-member' | 'forbidden' | 'no-assignee' | ContentRefusal>> {
	const space = await loadItemSpace(db, viewerId, spaceId);
	if (!space) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!managesSpace(space, viewerId)) {
		return { ok: false, reason: 'forbidden' };
	}
	const assigneeUserId = assigneeFor(space, viewerId);
	if (!assigneeUserId) {
		return { ok: false, reason: 'no-assignee' };
	}
	const problem = rewardContentProblem(input.content, await vaultIdForSpace(db, space));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const inserted = await db
		.insert(rewards)
		.values({
			id: rewardId,
			spaceId,
			createdByUserId: viewerId,
			assigneeUserId,
			...sealedRewardColumns(input.content, 0),
			cost: input.cost,
			active: input.active
		})
		.onConflictDoNothing()
		.returning({ id: rewards.id });
	if (inserted.length === 0) {
		return { ok: false, reason: 'id-taken' };
	}
	return { ok: true, id: rewardId };
}

/**
 * Replaces a reward's cost, active flag and sealed content, for someone who
 * may edit it (`managesRecord`). Nobody edits a reward set for them: in a
 * shared space that would let the person claiming it set its price.
 * Compare-and-swap on `revision`, as `updateTask`.
 */
export async function updateReward(
	db: Db,
	viewerId: string,
	rewardId: string,
	input: RewardInput & { expectedRevision: number }
): Promise<RewardResult<'not-found' | 'forbidden' | 'conflict' | ContentRefusal>> {
	const found = await rewardInViewersSpace(db, viewerId, rewardId);
	if (!found) {
		return { ok: false, reason: 'not-found' };
	}
	if (!managesRecord(found.reward, found.space, viewerId)) {
		return { ok: false, reason: 'forbidden' };
	}
	const problem = rewardContentProblem(input.content, await vaultIdForSpace(db, found.space));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const rows = await db
		.update(rewards)
		.set({
			...sealedRewardColumns(input.content, input.expectedRevision + 1),
			cost: input.cost,
			active: input.active
		})
		.where(and(eq(rewards.id, rewardId), eq(rewards.revision, input.expectedRevision)))
		.returning({ id: rewards.id });
	return rows.length > 0 ? { ok: true } : { ok: false, reason: 'conflict' };
}

/**
 * Replaces a reward's sealed content and nothing else: what ticking a to-do
 * item in its description saves (docs/rich-text.md, "To-do lists"), so that
 * the tick cannot carry a stale cost or active flag back with it. Under the
 * same permission as `updateReward`, and compare-and-swap all the same.
 */
export async function updateRewardContent(
	db: Db,
	viewerId: string,
	rewardId: string,
	input: { content: RewardInput['content']; expectedRevision: number }
): Promise<RewardResult<'not-found' | 'forbidden' | 'conflict' | ContentRefusal>> {
	const found = await rewardInViewersSpace(db, viewerId, rewardId);
	if (!found) {
		return { ok: false, reason: 'not-found' };
	}
	if (!managesRecord(found.reward, found.space, viewerId)) {
		return { ok: false, reason: 'forbidden' };
	}
	const problem = rewardContentProblem(input.content, await vaultIdForSpace(db, found.space));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const rows = await db
		.update(rewards)
		.set(sealedRewardColumns(input.content, input.expectedRevision + 1))
		.where(and(eq(rewards.id, rewardId), eq(rewards.revision, input.expectedRevision)))
		.returning({ id: rewards.id });
	return rows.length > 0 ? { ok: true } : { ok: false, reason: 'conflict' };
}

/**
 * Sets one member's credits in a space (`canSetBalance`): the viewer's own in
 * their own space, or, in a shared one they manage, their partner's — never
 * their own there, which would be paying themselves.
 */
export async function setRewardBalance(
	db: Db,
	viewerId: string,
	spaceId: string,
	targetUserId: string,
	credits: number,
	now: Date = new Date()
): Promise<RewardResult<'not-a-member' | 'forbidden'>> {
	const space = await loadItemSpace(db, viewerId, spaceId);
	if (!space) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!canSetBalance(space, viewerId, targetUserId)) {
		return { ok: false, reason: 'forbidden' };
	}
	await db
		.insert(rewardBalances)
		.values({ spaceId, userId: targetUserId, credits, createdAt: now, updatedAt: now })
		.onConflictDoUpdate({
			target: [rewardBalances.spaceId, rewardBalances.userId],
			set: { credits, updatedAt: now }
		});
	return { ok: true };
}

/**
 * Claims a reward for the person it is set for, from their balance in its
 * space. The claim copies the reward's sealed record and cost as they stand
 * (the claimant need not be its author and cannot re-seal it), in the same
 * batch that takes the credits.
 */
export async function claimReward(
	db: Db,
	viewerId: string,
	rewardId: string,
	now: Date = new Date()
): Promise<RewardResult<'not-found' | 'not-allowed' | 'inactive' | 'insufficient-credits'>> {
	const found = await rewardInViewersSpace(db, viewerId, rewardId);
	if (!found) {
		return { ok: false, reason: 'not-found' };
	}
	const { reward, space } = found;
	if (rewardListFor(reward, space, viewerId) !== 'claim') {
		return { ok: false, reason: 'not-allowed' };
	}
	if (!reward.active) {
		return { ok: false, reason: 'inactive' };
	}
	const credits = await readBalance(db, reward.spaceId, viewerId);
	if (credits < reward.cost) {
		return { ok: false, reason: 'insufficient-credits' };
	}

	await db.batch([
		db.insert(rewardClaims).values({
			spaceId: reward.spaceId,
			rewardId: reward.id,
			claimedByUserId: viewerId,
			createdByUserId: reward.createdByUserId,
			snapshotCiphertext: reward.ciphertext,
			snapshotVaultId: reward.vaultId,
			snapshotVersion: reward.payloadVersion,
			snapshotRecordId: reward.id,
			rewardCost: reward.cost,
			createdAt: now,
			updatedAt: now
		}),
		db
			.update(rewardBalances)
			.set({
				// In SQL rather than written back, for the reason completing a task
				// adds in SQL: a completion landing between the read and this write
				// would otherwise be lost.
				credits: sql`max(${rewardBalances.credits} - ${reward.cost}, 0)`,
				updatedAt: now
			})
			.where(and(eq(rewardBalances.spaceId, reward.spaceId), eq(rewardBalances.userId, viewerId)))
	]);
	return { ok: true };
}

/** Matches the tasks widget: three rows, then a count. See `tasks.ts`. */
const WIDGET_PREVIEW_LIMIT = 3;

/**
 * The rewards card, for the spaces it covers, as `getTasksWidget`: what the
 * viewer can claim where they claim anything, and otherwise a count of what
 * they keep for others. Every balance is returned separately rather than
 * summed: a space's credits buy that space's rewards and nothing else, so one
 * total would state a spending power nobody has.
 */
export async function getRewardsWidget(
	db: Db,
	viewerId: string,
	spaceIds: readonly string[],
	names: ReadonlyMap<string, PartnerNamesSource>
): Promise<RewardsWidgetView> {
	const spaces = await spacesInOrder(db, viewerId, spaceIds);
	const empty = {
		viewerActs: true,
		balances: [],
		claimable: [],
		claimableCount: 0,
		activeCount: 0
	};
	if (spaces.length === 0) {
		return empty;
	}
	const ids = spaces.map((space) => space.id);
	const [rows, credits] = await Promise.all([
		db
			.select({
				id: rewards.id,
				spaceId: rewards.spaceId,
				createdByUserId: rewards.createdByUserId,
				assigneeUserId: rewards.assigneeUserId,
				ciphertext: rewards.ciphertext,
				vaultId: rewards.vaultId,
				payloadVersion: rewards.payloadVersion,
				cost: rewards.cost
			})
			.from(rewards)
			.where(and(inArray(rewards.spaceId, ids), eq(rewards.active, true))),
		readBalances(db, ids)
	]);
	const bySpace = new Map(spaces.map((space) => [space.id, space]));
	const listOf = (row: (typeof rows)[number]) => {
		const space = bySpace.get(row.spaceId);
		return space ? rewardListFor(row, space, viewerId) : null;
	};
	const acting = spaces.filter((space) => viewerActsIn(space, viewerId));
	if (acting.length === 0) {
		return {
			...empty,
			viewerActs: false,
			activeCount: rows.filter((row) => listOf(row) === 'set').length
		};
	}
	const held = new Map(
		credits.filter((row) => row.userId === viewerId).map((row) => [row.spaceId, row.credits])
	);
	const several = spaces.length > 1;
	const balances: WidgetBalanceView[] = acting.map((space) => ({
		id: space.id,
		// One space has one balance, with nothing to tell it apart from.
		label: several && space.kind === 'shared' ? (names.get(space.id) ?? null) : null,
		credits: held.get(space.id) ?? 0
	}));
	// Cheapest first across every space, so the three rows the card shows are
	// the three nearest to hand. Each priced against its own space's balance.
	const claimable = rows
		.filter((row) => listOf(row) === 'claim' && (held.get(row.spaceId) ?? 0) >= row.cost)
		.sort((a, b) => a.cost - b.cost);
	return {
		viewerActs: true,
		balances,
		claimable: claimable.slice(0, WIDGET_PREVIEW_LIMIT).map((row) => ({
			id: row.id,
			// Only a guide's title is shown as it is; a reward's is sealed.
			title: '',
			kind: 'reward' as const,
			sealed: sealedRef(row.id, row),
			note: `${row.cost}`,
			context: several ? (names.get(row.spaceId) ?? null) : null
		})),
		claimableCount: claimable.length,
		activeCount: rows.filter((row) => listOf(row) === 'claim').length
	};
}
