import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { PartnerNamesSource } from '../partnership';
import { canClaimFromPartnership, type RewardInput } from '../rewards';
import { rewardKind } from '../sealed-kinds/tasks';
import type {
	HomePartnerRewardsSectionView,
	PartnershipRewardClaimView,
	PartnershipRewardView,
	PartnerView,
	RewardHistoryView,
	RewardsWidgetView,
	SelfRewardsSectionView,
	SelfRewardView,
	WidgetBalanceView
} from '../types';
import type { Db } from './db';
import {
	partnershipRewardClaims,
	partnershipRewardCredits,
	partnershipRewards,
	partnerships,
	selfRewardClaims,
	selfRewardCredits,
	selfRewards
} from './db/schema';
import { getPartnershipForUser } from './partnerships';
import {
	partnershipVaultIdFor,
	sealedIsAcceptable,
	sealedRef,
	selfVaultIdFor,
	snapshotRef
} from './sealed-content';

const selfRewardColumns = {
	id: selfRewards.id,
	title: selfRewards.title,
	description: selfRewards.description,
	ciphertext: selfRewards.ciphertext,
	vaultId: selfRewards.vaultId,
	payloadVersion: selfRewards.payloadVersion,
	revision: selfRewards.revision,
	cost: selfRewards.cost,
	active: selfRewards.active,
	createdAt: selfRewards.createdAt,
	updatedAt: selfRewards.updatedAt
} as const;

const partnershipRewardColumns = {
	id: partnershipRewards.id,
	partnershipId: partnershipRewards.partnershipId,
	createdByUserId: partnershipRewards.createdByUserId,
	title: partnershipRewards.title,
	description: partnershipRewards.description,
	ciphertext: partnershipRewards.ciphertext,
	vaultId: partnershipRewards.vaultId,
	payloadVersion: partnershipRewards.payloadVersion,
	revision: partnershipRewards.revision,
	cost: partnershipRewards.cost,
	active: partnershipRewards.active,
	createdAt: partnershipRewards.createdAt,
	updatedAt: partnershipRewards.updatedAt
} as const;

const rewardHistoryColumns = {
	id: selfRewardClaims.id,
	rewardTitle: selfRewardClaims.rewardTitle,
	rewardDescription: selfRewardClaims.rewardDescription,
	rewardCost: selfRewardClaims.rewardCost,
	snapshotCiphertext: selfRewardClaims.snapshotCiphertext,
	snapshotVaultId: selfRewardClaims.snapshotVaultId,
	snapshotVersion: selfRewardClaims.snapshotVersion,
	snapshotRecordId: selfRewardClaims.snapshotRecordId,
	createdAt: selfRewardClaims.createdAt
} as const;

const partnershipRewardHistoryColumns = {
	id: partnershipRewardClaims.id,
	claimedByUserId: partnershipRewardClaims.claimedByUserId,
	createdByUserId: partnershipRewardClaims.createdByUserId,
	rewardTitle: partnershipRewardClaims.rewardTitle,
	rewardDescription: partnershipRewardClaims.rewardDescription,
	rewardCost: partnershipRewardClaims.rewardCost,
	snapshotCiphertext: partnershipRewardClaims.snapshotCiphertext,
	snapshotVaultId: partnershipRewardClaims.snapshotVaultId,
	snapshotVersion: partnershipRewardClaims.snapshotVersion,
	snapshotRecordId: partnershipRewardClaims.snapshotRecordId,
	createdAt: partnershipRewardClaims.createdAt
} as const;

type SelfRewardRow = {
	id: string;
	title: string | null;
	description: string | null;
	ciphertext: string | null;
	vaultId: string | null;
	payloadVersion: number | null;
	revision: number;
	cost: number;
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
};

type SelfRewardHistoryRow = {
	id: string;
	rewardTitle: string | null;
	rewardDescription: string | null;
	rewardCost: number;
	snapshotCiphertext: string | null;
	snapshotVaultId: string | null;
	snapshotVersion: number | null;
	snapshotRecordId: string | null;
	createdAt: Date;
};

type PartnershipRewardRow = {
	id: string;
	partnershipId: string;
	createdByUserId: string;
	title: string | null;
	description: string | null;
	ciphertext: string | null;
	vaultId: string | null;
	payloadVersion: number | null;
	revision: number;
	cost: number;
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
};

type RewardMembership = {
	partnership: NonNullable<Awaited<ReturnType<typeof getPartnershipForUser>>>;
	viewerId: string;
	canManage: boolean;
	canClaim: boolean;
	counterpartUserId: string;
};

export type PartnershipRewardsPageView = {
	partner: {
		id: string;
		names: PartnerNamesSource;
		canManageRewards: boolean;
		canClaimRewards: boolean;
	};
	counterpartUserId: string | null;
	viewerCredits: number;
	counterpartCredits: number | null;
	rewards: PartnershipRewardView[];
	claims: PartnershipRewardClaimView[];
};

type RewardResult<TReason extends string> = { ok: true } | { ok: false; reason: TReason };

/** Why the server refused the sealed half of a reward write. */
/**
 * Why a sealed write was refused. `id-taken`: the browser chooses a new
 * record's id (it is part of what the content is sealed to), so a create can
 * name one that exists — a retried post whose first attempt landed, most
 * likely. Refused rather than left to fail as a primary-key error.
 */
type ContentRefusal = 'bad-content' | 'wrong-vault' | 'id-taken';

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

/** The columns a sealed reward write sets. The plaintext goes once the content is sealed. */
function sealedRewardColumns(content: RewardInput['content'], revision: number) {
	return {
		ciphertext: content.ciphertext,
		vaultId: content.vaultId,
		payloadVersion: content.payloadVersion,
		revision,
		title: '',
		description: null
	};
}

/**
 * What a claim records of the reward: its sealed record copied as it is — the
 * claimant need not be its author and cannot re-seal it — or, for a reward
 * still in plaintext, a plaintext snapshot as before sealing.
 */
function claimSnapshot(reward: SelfRewardRow | PartnershipRewardRow) {
	const sealed = sealedRef(reward.id, reward);
	if (sealed) {
		return {
			snapshotCiphertext: sealed.ciphertext,
			snapshotVaultId: sealed.vaultId,
			snapshotVersion: sealed.payloadVersion,
			snapshotRecordId: sealed.recordId,
			rewardTitle: '',
			rewardDescription: null
		};
	}
	return { rewardTitle: reward.title ?? '', rewardDescription: reward.description };
}
type CreateRewardResult<TReason extends string> =
	| { ok: true; id: string }
	| { ok: false; reason: TReason };

function canClaimFromPartnershipView(partnership: RewardMembership['partnership']): boolean {
	// The claimant side is the non-controller when control is one-sided, and
	// both sides when control is shared. `canEdit` already answers "am I the
	// current controller?" in this viewer's terms.
	return partnership.control === 'both' || !partnership.canEdit;
}

async function readSelfCredits(db: Db, userId: string): Promise<number> {
	const rows = await db
		.select({ credits: selfRewardCredits.credits })
		.from(selfRewardCredits)
		.where(eq(selfRewardCredits.ownerId, userId))
		.limit(1);
	return rows[0]?.credits ?? 0;
}

async function readPartnershipCredits(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<number> {
	const rows = await db
		.select({ credits: partnershipRewardCredits.credits })
		.from(partnershipRewardCredits)
		.where(
			and(
				eq(partnershipRewardCredits.partnershipId, partnershipId),
				eq(partnershipRewardCredits.userId, userId)
			)
		)
		.limit(1);
	return rows[0]?.credits ?? 0;
}

function toSelfRewardView(row: SelfRewardRow, credits: number): SelfRewardView {
	return {
		id: row.id,
		title: row.title ?? '',
		description: row.description,
		sealed: sealedRef(row.id, row),
		revision: row.revision,
		cost: row.cost,
		active: row.active,
		canClaim: row.active && credits >= row.cost,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function toHistoryView(row: SelfRewardHistoryRow): RewardHistoryView {
	return {
		id: row.id,
		rewardTitle: row.rewardTitle ?? '',
		rewardDescription: row.rewardDescription,
		rewardCost: row.rewardCost,
		createdAt: row.createdAt,
		sealed: snapshotRef(row)
	};
}

function toPartnershipRewardView(
	row: PartnershipRewardRow,
	viewerId: string,
	viewerCredits: number,
	viewerCanClaim: boolean
): PartnershipRewardView {
	const createdByMe = row.createdByUserId === viewerId;
	return {
		id: row.id,
		title: row.title ?? '',
		description: row.description,
		sealed: sealedRef(row.id, row),
		revision: row.revision,
		cost: row.cost,
		active: row.active,
		createdByMe,
		canClaim: viewerCanClaim && row.active && !createdByMe && viewerCredits >= row.cost,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

export async function requireRewardMembership(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<RewardMembership | null> {
	const partnership = await getPartnershipForUser(db, partnershipId, userId);
	if (partnership?.status !== 'accepted' || !partnership.counterpart?.userId) {
		return null;
	}
	return {
		partnership,
		viewerId: userId,
		canManage: partnership.canEdit,
		canClaim: canClaimFromPartnershipView(partnership),
		counterpartUserId: partnership.counterpart.userId
	};
}

export async function getSelfRewardsSection(
	db: Db,
	userId: string
): Promise<SelfRewardsSectionView> {
	const [credits, rewards, claims] = await Promise.all([
		readSelfCredits(db, userId),
		db
			.select(selfRewardColumns)
			.from(selfRewards)
			.where(eq(selfRewards.ownerId, userId))
			.orderBy(desc(selfRewards.active), desc(selfRewards.createdAt), asc(selfRewards.id)),
		db
			.select(rewardHistoryColumns)
			.from(selfRewardClaims)
			.where(eq(selfRewardClaims.ownerId, userId))
			.orderBy(desc(selfRewardClaims.createdAt), desc(selfRewardClaims.id))
	]);

	return {
		credits,
		rewards: rewards.map((row) => toSelfRewardView(row, credits)),
		claims: claims.map(toHistoryView)
	};
}

export async function getSelfRewardForUser(
	db: Db,
	userId: string,
	rewardId: string
): Promise<SelfRewardView | null> {
	const rows = await db
		.select(selfRewardColumns)
		.from(selfRewards)
		.where(and(eq(selfRewards.id, rewardId), eq(selfRewards.ownerId, userId)))
		.limit(1);
	const [row] = rows;
	if (!row) {
		return null;
	}
	return toSelfRewardView(row, await readSelfCredits(db, userId));
}

/** Creates a self reward, its content sealed in the owner's own vault. `rewardId` comes from the browser. */
export async function createSelfReward(
	db: Db,
	userId: string,
	rewardId: string,
	input: RewardInput
): Promise<CreateRewardResult<ContentRefusal>> {
	const problem = rewardContentProblem(input.content, await selfVaultIdFor(db, userId));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const inserted = await db
		.insert(selfRewards)
		.values({
			id: rewardId,
			ownerId: userId,
			...sealedRewardColumns(input.content, 0),
			cost: input.cost,
			active: input.active
		})
		.onConflictDoNothing()
		.returning({ id: selfRewards.id });
	if (inserted.length === 0) {
		return { ok: false, reason: 'id-taken' };
	}
	return { ok: true, id: rewardId };
}

/** Compare-and-swap on `revision`, as `updateSelfTask`. */
export async function updateSelfReward(
	db: Db,
	userId: string,
	rewardId: string,
	input: RewardInput & { expectedRevision: number }
): Promise<RewardResult<'not-found' | 'conflict' | ContentRefusal>> {
	const problem = rewardContentProblem(input.content, await selfVaultIdFor(db, userId));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const rows = await db
		.update(selfRewards)
		.set({
			...sealedRewardColumns(input.content, input.expectedRevision + 1),
			cost: input.cost,
			active: input.active
		})
		.where(
			and(
				eq(selfRewards.id, rewardId),
				eq(selfRewards.ownerId, userId),
				eq(selfRewards.revision, input.expectedRevision)
			)
		)
		.returning({ id: selfRewards.id });
	if (rows.length > 0) {
		return { ok: true };
	}
	const [exists] = await db
		.select({ id: selfRewards.id })
		.from(selfRewards)
		.where(and(eq(selfRewards.id, rewardId), eq(selfRewards.ownerId, userId)))
		.limit(1);
	return { ok: false, reason: exists ? 'conflict' : 'not-found' };
}

/**
 * Replaces a self reward's sealed content and nothing else: what ticking a
 * to-do item in its description saves (docs/rich-text.md, "To-do lists"), so
 * that the tick cannot carry a stale cost or active flag back with it.
 * Compare-and-swap on `revision`, as `updateSelfReward`.
 */
export async function updateSelfRewardContent(
	db: Db,
	userId: string,
	rewardId: string,
	input: { content: RewardInput['content']; expectedRevision: number }
): Promise<RewardResult<'not-found' | 'conflict' | ContentRefusal>> {
	const problem = rewardContentProblem(input.content, await selfVaultIdFor(db, userId));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const rows = await db
		.update(selfRewards)
		.set(sealedRewardColumns(input.content, input.expectedRevision + 1))
		.where(
			and(
				eq(selfRewards.id, rewardId),
				eq(selfRewards.ownerId, userId),
				eq(selfRewards.revision, input.expectedRevision)
			)
		)
		.returning({ id: selfRewards.id });
	if (rows.length > 0) {
		return { ok: true };
	}
	const [exists] = await db
		.select({ id: selfRewards.id })
		.from(selfRewards)
		.where(and(eq(selfRewards.id, rewardId), eq(selfRewards.ownerId, userId)))
		.limit(1);
	return { ok: false, reason: exists ? 'conflict' : 'not-found' };
}

export async function setSelfRewardCredits(db: Db, userId: string, credits: number): Promise<void> {
	await db
		.insert(selfRewardCredits)
		.values({ ownerId: userId, credits })
		.onConflictDoUpdate({
			target: selfRewardCredits.ownerId,
			set: { credits, updatedAt: new Date() }
		});
}

export async function claimSelfReward(
	db: Db,
	userId: string,
	rewardId: string,
	now: Date = new Date()
): Promise<RewardResult<'not-found' | 'inactive' | 'insufficient-credits'>> {
	const rows = await db
		.select(selfRewardColumns)
		.from(selfRewards)
		.where(and(eq(selfRewards.id, rewardId), eq(selfRewards.ownerId, userId)))
		.limit(1);
	const [reward] = rows;
	if (!reward) {
		return { ok: false, reason: 'not-found' };
	}
	if (!reward.active) {
		return { ok: false, reason: 'inactive' };
	}

	const credits = await readSelfCredits(db, userId);
	if (credits < reward.cost) {
		return { ok: false, reason: 'insufficient-credits' };
	}

	const nextCredits = credits - reward.cost;
	await db.batch([
		db.insert(selfRewardClaims).values({
			ownerId: userId,
			rewardId: reward.id,
			...claimSnapshot(reward),
			rewardCost: reward.cost,
			createdAt: now,
			updatedAt: now
		}),
		db
			.insert(selfRewardCredits)
			.values({ ownerId: userId, credits: nextCredits, createdAt: now, updatedAt: now })
			.onConflictDoUpdate({
				target: selfRewardCredits.ownerId,
				set: { credits: nextCredits, updatedAt: now }
			})
	]);

	return { ok: true };
}

export async function getPartnershipRewardsPage(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<PartnershipRewardsPageView | null> {
	const membership = await requireRewardMembership(db, partnershipId, userId);
	if (!membership) {
		return null;
	}

	const [viewerCredits, counterpartCredits, rewards, claims] = await Promise.all([
		readPartnershipCredits(db, partnershipId, userId),
		membership.canManage
			? readPartnershipCredits(db, partnershipId, membership.counterpartUserId)
			: Promise.resolve(0),
		db
			.select(partnershipRewardColumns)
			.from(partnershipRewards)
			.where(eq(partnershipRewards.partnershipId, partnershipId))
			.orderBy(
				desc(partnershipRewards.active),
				desc(partnershipRewards.createdAt),
				asc(partnershipRewards.id)
			),
		db
			.select(partnershipRewardHistoryColumns)
			.from(partnershipRewardClaims)
			.where(eq(partnershipRewardClaims.partnershipId, partnershipId))
			.orderBy(desc(partnershipRewardClaims.createdAt), desc(partnershipRewardClaims.id))
	]);

	return {
		partner: {
			id: partnershipId,
			names: membership.partnership.names,
			canManageRewards: membership.canManage,
			canClaimRewards: membership.canClaim
		},
		counterpartUserId: membership.canManage ? membership.counterpartUserId : null,
		viewerCredits,
		counterpartCredits: membership.canManage ? counterpartCredits : null,
		rewards: rewards.map((row) =>
			toPartnershipRewardView(row, userId, viewerCredits, membership.canClaim)
		),
		claims: claims.map((row) => ({
			...toHistoryView(row),
			mine: row.claimedByUserId === userId,
			createdByMe: row.createdByUserId === userId
		}))
	};
}

export async function getPartnershipRewardForUser(
	db: Db,
	partnershipId: string,
	userId: string,
	rewardId: string
): Promise<{
	partner: { id: string; names: PartnerNamesSource; canManageRewards: boolean };
	reward: PartnershipRewardView;
} | null> {
	const membership = await requireRewardMembership(db, partnershipId, userId);
	if (!membership) {
		return null;
	}

	const rows = await db
		.select(partnershipRewardColumns)
		.from(partnershipRewards)
		.where(
			and(eq(partnershipRewards.id, rewardId), eq(partnershipRewards.partnershipId, partnershipId))
		)
		.limit(1);
	const [row] = rows;
	if (!row) {
		return null;
	}

	return {
		partner: {
			id: partnershipId,
			names: membership.partnership.names,
			canManageRewards: membership.canManage
		},
		reward: toPartnershipRewardView(
			row,
			userId,
			await readPartnershipCredits(db, partnershipId, userId),
			membership.canClaim
		)
	};
}

export async function createPartnershipReward(
	db: Db,
	partnershipId: string,
	userId: string,
	rewardId: string,
	input: RewardInput
): Promise<CreateRewardResult<'not-a-member' | 'forbidden' | ContentRefusal>> {
	const membership = await requireRewardMembership(db, partnershipId, userId);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!membership.canManage) {
		return { ok: false, reason: 'forbidden' };
	}
	const problem = rewardContentProblem(
		input.content,
		await partnershipVaultIdFor(db, partnershipId)
	);
	if (problem) {
		return { ok: false, reason: problem };
	}

	const inserted = await db
		.insert(partnershipRewards)
		.values({
			id: rewardId,
			partnershipId,
			createdByUserId: userId,
			...sealedRewardColumns(input.content, 0),
			cost: input.cost,
			active: input.active
		})
		.onConflictDoNothing()
		.returning({ id: partnershipRewards.id });
	if (inserted.length === 0) {
		return { ok: false, reason: 'id-taken' };
	}

	return { ok: true, id: rewardId };
}

export async function updatePartnershipReward(
	db: Db,
	partnershipId: string,
	userId: string,
	rewardId: string,
	input: RewardInput & { expectedRevision: number }
): Promise<RewardResult<'not-a-member' | 'forbidden' | 'not-found' | 'conflict' | ContentRefusal>> {
	const membership = await requireRewardMembership(db, partnershipId, userId);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!membership.canManage) {
		return { ok: false, reason: 'forbidden' };
	}
	const problem = rewardContentProblem(
		input.content,
		await partnershipVaultIdFor(db, partnershipId)
	);
	if (problem) {
		return { ok: false, reason: problem };
	}

	const rows = await db
		.update(partnershipRewards)
		.set({
			...sealedRewardColumns(input.content, input.expectedRevision + 1),
			cost: input.cost,
			active: input.active
		})
		.where(
			and(
				eq(partnershipRewards.id, rewardId),
				eq(partnershipRewards.partnershipId, partnershipId),
				eq(partnershipRewards.revision, input.expectedRevision)
			)
		)
		.returning({ id: partnershipRewards.id });
	if (rows.length > 0) {
		return { ok: true };
	}
	const [exists] = await db
		.select({ id: partnershipRewards.id })
		.from(partnershipRewards)
		.where(
			and(eq(partnershipRewards.id, rewardId), eq(partnershipRewards.partnershipId, partnershipId))
		)
		.limit(1);
	return { ok: false, reason: exists ? 'conflict' : 'not-found' };
}

/**
 * Replaces a partnership reward's sealed content and nothing else, as
 * `updateSelfRewardContent`, under the same permission as editing it.
 */
export async function updatePartnershipRewardContent(
	db: Db,
	partnershipId: string,
	userId: string,
	rewardId: string,
	input: { content: RewardInput['content']; expectedRevision: number }
): Promise<RewardResult<'not-a-member' | 'forbidden' | 'not-found' | 'conflict' | ContentRefusal>> {
	const membership = await requireRewardMembership(db, partnershipId, userId);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!membership.canManage) {
		return { ok: false, reason: 'forbidden' };
	}
	const problem = rewardContentProblem(
		input.content,
		await partnershipVaultIdFor(db, partnershipId)
	);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const rows = await db
		.update(partnershipRewards)
		.set(sealedRewardColumns(input.content, input.expectedRevision + 1))
		.where(
			and(
				eq(partnershipRewards.id, rewardId),
				eq(partnershipRewards.partnershipId, partnershipId),
				eq(partnershipRewards.revision, input.expectedRevision)
			)
		)
		.returning({ id: partnershipRewards.id });
	if (rows.length > 0) {
		return { ok: true };
	}
	const [exists] = await db
		.select({ id: partnershipRewards.id })
		.from(partnershipRewards)
		.where(
			and(eq(partnershipRewards.id, rewardId), eq(partnershipRewards.partnershipId, partnershipId))
		)
		.limit(1);
	return { ok: false, reason: exists ? 'conflict' : 'not-found' };
}

export async function setPartnershipRewardCredits(
	db: Db,
	partnershipId: string,
	actorUserId: string,
	targetUserId: string,
	credits: number,
	now: Date = new Date()
): Promise<RewardResult<'not-a-member' | 'forbidden' | 'bad-target'>> {
	const membership = await requireRewardMembership(db, partnershipId, actorUserId);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!membership.canManage) {
		return { ok: false, reason: 'forbidden' };
	}
	if (targetUserId !== membership.counterpartUserId) {
		return { ok: false, reason: 'bad-target' };
	}

	await db
		.insert(partnershipRewardCredits)
		.values({ partnershipId, userId: targetUserId, credits, createdAt: now, updatedAt: now })
		.onConflictDoUpdate({
			target: [partnershipRewardCredits.partnershipId, partnershipRewardCredits.userId],
			set: { credits, updatedAt: now }
		});

	return { ok: true };
}

export async function claimPartnershipReward(
	db: Db,
	input: { partnershipId: string; rewardId: string; userId: string },
	now: Date = new Date()
): Promise<
	RewardResult<
		| 'not-a-member'
		| 'not-found'
		| 'not-allowed'
		| 'inactive'
		| 'own-reward'
		| 'insufficient-credits'
	>
> {
	const membership = await requireRewardMembership(db, input.partnershipId, input.userId);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (!membership.canClaim) {
		return { ok: false, reason: 'not-allowed' };
	}

	const rows = await db
		.select(partnershipRewardColumns)
		.from(partnershipRewards)
		.where(
			and(
				eq(partnershipRewards.id, input.rewardId),
				eq(partnershipRewards.partnershipId, input.partnershipId)
			)
		)
		.limit(1);
	const [reward] = rows;
	if (!reward) {
		return { ok: false, reason: 'not-found' };
	}
	if (!reward.active) {
		return { ok: false, reason: 'inactive' };
	}
	if (reward.createdByUserId === input.userId) {
		return { ok: false, reason: 'own-reward' };
	}

	const credits = await readPartnershipCredits(db, input.partnershipId, input.userId);
	if (credits < reward.cost) {
		return { ok: false, reason: 'insufficient-credits' };
	}

	const nextCredits = credits - reward.cost;
	await db.batch([
		db.insert(partnershipRewardClaims).values({
			partnershipId: input.partnershipId,
			rewardId: reward.id,
			claimedByUserId: input.userId,
			createdByUserId: reward.createdByUserId,
			...claimSnapshot(reward),
			rewardCost: reward.cost,
			createdAt: now,
			updatedAt: now
		}),
		db
			.insert(partnershipRewardCredits)
			.values({
				partnershipId: input.partnershipId,
				userId: input.userId,
				credits: nextCredits,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [partnershipRewardCredits.partnershipId, partnershipRewardCredits.userId],
				set: { credits: nextCredits, updatedAt: now }
			})
	]);

	return { ok: true };
}

export async function listHomePartnerRewardSections(
	db: Db,
	userId: string,
	partners: PartnerView[]
): Promise<HomePartnerRewardsSectionView[]> {
	if (partners.length === 0) {
		return [];
	}

	const partnershipIds = partners.map((partner) => partner.id);
	const [partnershipRows, creditRows, rewardRows] = await Promise.all([
		db
			.select({
				id: partnerships.id,
				status: partnerships.status,
				control: partnerships.control,
				inviterId: partnerships.inviterId,
				inviteeId: partnerships.inviteeId,
				inviterName: partnerships.inviterName,
				inviteeName: partnerships.inviteeName,
				inviterRole: partnerships.inviterRole,
				inviteeRole: partnerships.inviteeRole
			})
			.from(partnerships)
			.where(inArray(partnerships.id, partnershipIds)),
		db
			.select({
				partnershipId: partnershipRewardCredits.partnershipId,
				credits: partnershipRewardCredits.credits
			})
			.from(partnershipRewardCredits)
			.where(
				and(
					inArray(partnershipRewardCredits.partnershipId, partnershipIds),
					eq(partnershipRewardCredits.userId, userId)
				)
			),
		db
			.select(partnershipRewardColumns)
			.from(partnershipRewards)
			.where(
				and(
					inArray(partnershipRewards.partnershipId, partnershipIds),
					eq(partnershipRewards.active, true)
				)
			)
			.orderBy(desc(partnershipRewards.createdAt), asc(partnershipRewards.id))
	]);

	const claimablePartnerships = new Map(
		partnershipRows.map((row) => [row.id, canClaimFromPartnership(row, userId)])
	);
	const creditsByPartnership = new Map(creditRows.map((row) => [row.partnershipId, row.credits]));
	const rewardsByPartnership = new Map<string, PartnershipRewardView[]>();

	for (const row of rewardRows) {
		if (!claimablePartnerships.get(row.partnershipId)) {
			continue;
		}
		if (row.createdByUserId === userId) {
			continue;
		}
		const credits = creditsByPartnership.get(row.partnershipId) ?? 0;
		const list = rewardsByPartnership.get(row.partnershipId) ?? [];
		list.push(toPartnershipRewardView(row, userId, credits, true));
		rewardsByPartnership.set(row.partnershipId, list);
	}

	return partners.flatMap((partner) => {
		if (!claimablePartnerships.get(partner.id)) {
			return [];
		}
		const rewards = rewardsByPartnership.get(partner.id) ?? [];
		return [
			{
				partnershipId: partner.id,
				names: partner.names,
				image: partner.image,
				credits: creditsByPartnership.get(partner.id) ?? 0,
				rewards
			}
		];
	});
}

/** Matches the tasks widget: three rows, then a count. See `tasks.ts`. */
const WIDGET_PREVIEW_LIMIT = 3;

type RewardWidgetRow = {
	id: string;
	title: string | null;
	ciphertext: string | null;
	vaultId: string | null;
	payloadVersion: number | null;
	cost: number;
	/** Whose section this came from on /home/rewards. Null for your own. */
	context?: PartnerNamesSource | null;
	/**
	 * The balance this row is priced against.
	 *
	 * Per row, not per view, because credits do not pool: a partnership's
	 * credits buy that partnership's rewards and nothing else. Comparing every
	 * row against one total would offer claims the claim path then refuses.
	 */
	credits: number;
};

function toRewardsWidgetView(
	rows: RewardWidgetRow[],
	viewerActs: boolean,
	balances: WidgetBalanceView[]
): RewardsWidgetView {
	const claimable = rows.filter((row) => row.credits >= row.cost);
	return {
		viewerActs,
		balances,
		// Withheld from the managing side for the same reason the tasks widget
		// withholds its ready list: they do not claim these, so the titles would
		// be serialised into the page for a body that never shows them.
		claimable: viewerActs
			? claimable.slice(0, WIDGET_PREVIEW_LIMIT).map((row) => ({
					id: row.id,
					title: row.title ?? '',
					kind: 'reward' as const,
					sealed: sealedRef(row.id, row),
					note: `${row.cost}`,
					context: row.context ?? null
				}))
			: [],
		claimableCount: claimable.length,
		activeCount: rows.length
	};
}

/**
 * The /home rewards card: your own rewards AND every partner reward you can claim.
 *
 * Both, for the same reason the tasks card is both — /home/rewards, the page
 * this links to, shows both, and a card that counted only self rewards would
 * claim there was nothing to claim while a partner reward sat waiting.
 *
 * Which partner rewards count is decided the same way
 * `listHomePartnerRewardSections` decides it: the partnerships where you are on
 * the claiming side, minus the ones you wrote yourself. Partnerships you
 * *manage* contribute nothing, which is why `viewerActs` is always true here.
 *
 * Every balance is returned separately rather than summed. Partnership credits
 * are not spendable on self rewards and vice versa, so one total would state a
 * spending power nobody has.
 *
 * Active rows and three columns, deliberately not `getSelfRewardsSection` —
 * that also reads every claim ever made, and the card shows at most three titles.
 */
export async function getHomeRewardsWidget(
	db: Db,
	userId: string,
	partners: PartnerView[]
): Promise<RewardsWidgetView> {
	const partnershipIds = partners.map((partner) => partner.id);

	const [selfCredits, selfRows, partnershipRows, creditRows, partnerRewardRows] = await Promise.all(
		[
			readSelfCredits(db, userId),
			db
				.select({
					id: selfRewards.id,
					title: selfRewards.title,
					ciphertext: selfRewards.ciphertext,
					vaultId: selfRewards.vaultId,
					payloadVersion: selfRewards.payloadVersion,
					cost: selfRewards.cost
				})
				.from(selfRewards)
				.where(and(eq(selfRewards.ownerId, userId), eq(selfRewards.active, true))),
			// `in ()` is a syntax error in SQLite, and a fresh account has no partners.
			partnershipIds.length === 0
				? Promise.resolve([])
				: db
						.select({
							id: partnerships.id,
							status: partnerships.status,
							control: partnerships.control,
							inviterId: partnerships.inviterId,
							inviteeId: partnerships.inviteeId
						})
						.from(partnerships)
						.where(inArray(partnerships.id, partnershipIds)),
			partnershipIds.length === 0
				? Promise.resolve([])
				: db
						.select({
							partnershipId: partnershipRewardCredits.partnershipId,
							credits: partnershipRewardCredits.credits
						})
						.from(partnershipRewardCredits)
						.where(
							and(
								inArray(partnershipRewardCredits.partnershipId, partnershipIds),
								eq(partnershipRewardCredits.userId, userId)
							)
						),
			partnershipIds.length === 0
				? Promise.resolve([])
				: db
						.select({
							id: partnershipRewards.id,
							partnershipId: partnershipRewards.partnershipId,
							createdByUserId: partnershipRewards.createdByUserId,
							title: partnershipRewards.title,
							ciphertext: partnershipRewards.ciphertext,
							vaultId: partnershipRewards.vaultId,
							payloadVersion: partnershipRewards.payloadVersion,
							cost: partnershipRewards.cost
						})
						.from(partnershipRewards)
						.where(
							and(
								inArray(partnershipRewards.partnershipId, partnershipIds),
								eq(partnershipRewards.active, true)
							)
						)
		]
	);

	const claimable = new Map(
		partnershipRows.map((row) => [row.id, canClaimFromPartnership(row, userId)])
	);
	const creditsByPartnership = new Map(creditRows.map((row) => [row.partnershipId, row.credits]));
	const namesById = new Map(partners.map((partner) => [partner.id, partner.names]));

	const partnerRows: RewardWidgetRow[] = partnerRewardRows.flatMap((row) => {
		if (!claimable.get(row.partnershipId)) {
			return [];
		}
		// Authorship is independent of control: under shared control you claim
		// their rewards, never your own.
		if (row.createdByUserId === userId) {
			return [];
		}
		const names = namesById.get(row.partnershipId);
		if (!names) {
			return [];
		}
		return [
			{
				id: row.id,
				title: row.title,
				ciphertext: row.ciphertext,
				vaultId: row.vaultId,
				payloadVersion: row.payloadVersion,
				cost: row.cost,
				context: names,
				credits: creditsByPartnership.get(row.partnershipId) ?? 0
			}
		];
	});

	const balances: WidgetBalanceView[] = [
		{ id: 'self', label: null, credits: selfCredits },
		// Only the partnerships that contribute rewards get a balance line. A
		// balance with nothing to spend it on is a number with no question.
		...partners.flatMap((partner) =>
			claimable.get(partner.id)
				? [
						{
							id: partner.id,
							label: partner.names,
							credits: creditsByPartnership.get(partner.id) ?? 0
						}
					]
				: []
		)
	];

	// Cheapest first across both sources, so the three rows the card shows are
	// the three nearest to hand rather than the first three self rewards.
	const rows = [...selfRows.map((row) => ({ ...row, credits: selfCredits })), ...partnerRows].sort(
		(a, b) => a.cost - b.cost
	);

	// /home only ever shows the claiming side, so the viewer always acts.
	return toRewardsWidgetView(rows, true, balances);
}

/** The /partner/[id] rewards card. Null when this viewer has no business here. */
export async function getPartnershipRewardsWidget(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<RewardsWidgetView | null> {
	const membership = await requireRewardMembership(db, partnershipId, userId);
	if (!membership) {
		return null;
	}

	const [credits, rows] = await Promise.all([
		readPartnershipCredits(db, partnershipId, userId),
		db
			.select({
				id: partnershipRewards.id,
				createdByUserId: partnershipRewards.createdByUserId,
				title: partnershipRewards.title,
				ciphertext: partnershipRewards.ciphertext,
				vaultId: partnershipRewards.vaultId,
				payloadVersion: partnershipRewards.payloadVersion,
				cost: partnershipRewards.cost
			})
			.from(partnershipRewards)
			.where(
				and(
					eq(partnershipRewards.partnershipId, partnershipId),
					eq(partnershipRewards.active, true)
				)
			)
			.orderBy(
				asc(partnershipRewards.cost),
				desc(partnershipRewards.createdAt),
				asc(partnershipRewards.id)
			)
	]);

	// Authorship is independent of control, exactly as it is for tasks: under
	// shared control both sides can claim, but never their own reward.
	const visible = membership.canClaim
		? rows.filter((row) => row.createdByUserId !== userId)
		: rows.filter((row) => row.createdByUserId === userId);

	// One scope here, so one balance and no label — there is nothing to tell it
	// apart from. /home is the page that has several.
	return toRewardsWidgetView(
		visible.map((row) => ({ ...row, credits })),
		membership.canClaim,
		[{ id: partnershipId, label: null, credits }]
	);
}
