import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { namesSourceFor, type PartnerNamesSource, roleOf } from '../partnership';
import { partnershipNamesKind } from '../sealed-kinds/partnerships';
import { tagKind } from '../sealed-kinds/tags';
import { rewardKind, taskKind } from '../sealed-kinds/tasks';
import type { Db } from './db';
import {
	messageTags,
	partnershipRewardClaims,
	partnershipRewards,
	partnerships,
	partnershipTaskCompletions,
	partnershipTasks,
	selfRewardClaims,
	selfRewards,
	selfTaskCompletions,
	selfTasks
} from './db/schema';
import {
	isPartnershipMember,
	partnershipVaultIdFor,
	sealedIsAcceptable,
	selfVaultIdFor
} from './sealed-content';

/**
 * Sealing tasks and rewards written before sealing existed.
 *
 * The server cannot encrypt, so it hands a device the rows in a scope still
 * held in plaintext, and the device seals each into the scope's vault and
 * posts it back (`messaging/content-sealing.ts`, run in the background once
 * vaults are open). The plaintext columns are cleared in the same update.
 * See docs/tasks.md and docs/rewards.md.
 *
 * A scope is the user's own (self tasks and rewards) or one partnership's.
 * Any member of a partnership may seal its rows: both can already read them,
 * and both hold the vault.
 */

export type ContentScope = { kind: 'self' } | { kind: 'partnership'; partnershipId: string };

const PAGE_SIZE = 50;

export type Cursors = {
	tasks: string | null;
	completions: string | null;
	rewards: string | null;
	claims: string | null;
	/** A partnership's message tags; always null for the self scope, which has none. */
	tags: string | null;
};

export type UnsealedPage = {
	tasks: {
		id: string;
		title: string;
		description: string | null;
		completionMessages: string[];
	}[];
	completions: {
		id: string;
		taskTitle: string;
		taskDescription: string | null;
		completionMessage: string | null;
	}[];
	rewards: { id: string; title: string; description: string | null }[];
	claims: { id: string; rewardTitle: string; rewardDescription: string | null }[];
	tags: { id: string; name: string }[];
	/**
	 * A partnership's names, when they are not in its vault yet: where the
	 * device can read them from (`PartnerNamesSource`), for it to seal them in.
	 * Null when they already are, and always for the self scope.
	 */
	names: PartnerNamesSource | null;
	/** Pass back for the next page; null when this was the last. */
	next: Cursors | null;
};

function tablesFor(scope: ContentScope) {
	return scope.kind === 'self'
		? {
				tasks: selfTasks,
				completions: selfTaskCompletions,
				rewards: selfRewards,
				claims: selfRewardClaims
			}
		: {
				tasks: partnershipTasks,
				completions: partnershipTaskCompletions,
				rewards: partnershipRewards,
				claims: partnershipRewardClaims
			};
}

/** The vault this scope's content is sealed under, if the actor may write it. */
async function scopeVault(db: Db, actorId: string, scope: ContentScope): Promise<string | null> {
	if (scope.kind === 'self') {
		return await selfVaultIdFor(db, actorId);
	}
	if (!(await isPartnershipMember(db, scope.partnershipId, actorId))) {
		return null;
	}
	return await partnershipVaultIdFor(db, scope.partnershipId);
}

/** Rows owned by the actor, or in the partnership. One predicate for every table. */
function inScope(
	table: { ownerId: unknown } | { partnershipId: unknown },
	actorId: string,
	scope: ContentScope
) {
	if (scope.kind === 'self') {
		return eq((table as typeof selfTasks).ownerId, actorId);
	}
	return eq((table as typeof partnershipTasks).partnershipId, scope.partnershipId);
}

/**
 * A page of the scope's rows still in plaintext. Null when the actor may not
 * seal this scope. Each kind pages on its own cursor, so a row a device
 * cannot seal is moved past rather than handed out again for ever.
 */
export async function listUnsealedContent(
	db: Db,
	actorId: string,
	scope: ContentScope,
	after: Partial<Cursors> = {}
): Promise<UnsealedPage | null> {
	if (
		scope.kind === 'partnership' &&
		!(await isPartnershipMember(db, scope.partnershipId, actorId))
	) {
		return null;
	}
	const t = tablesFor(scope);

	const names =
		scope.kind === 'partnership' ? await unsealedNames(db, scope.partnershipId, actorId) : null;
	const tags =
		scope.kind === 'partnership'
			? await db
					.select({ id: messageTags.id, name: messageTags.name })
					.from(messageTags)
					.where(
						and(
							eq(messageTags.partnershipId, scope.partnershipId),
							sql`${messageTags.ciphertext} is null`,
							after.tags ? gt(messageTags.id, after.tags) : undefined
						)
					)
					.orderBy(asc(messageTags.id))
					.limit(PAGE_SIZE)
			: [];
	const [tasks, completions, rewards, claims] = await Promise.all([
		db
			.select({
				id: t.tasks.id,
				title: t.tasks.title,
				description: t.tasks.description,
				completionMessages: t.tasks.completionMessages
			})
			.from(t.tasks)
			.where(
				and(
					inScope(t.tasks, actorId, scope),
					sql`${t.tasks.ciphertext} is null`,
					after.tasks ? gt(t.tasks.id, after.tasks) : undefined
				)
			)
			.orderBy(asc(t.tasks.id))
			.limit(PAGE_SIZE),
		db
			.select({
				id: t.completions.id,
				taskTitle: t.completions.taskTitle,
				taskDescription: t.completions.taskDescription,
				completionMessage: t.completions.completionMessage
			})
			.from(t.completions)
			.where(
				and(
					inScope(t.completions, actorId, scope),
					sql`${t.completions.snapshotCiphertext} is null`,
					after.completions ? gt(t.completions.id, after.completions) : undefined
				)
			)
			.orderBy(asc(t.completions.id))
			.limit(PAGE_SIZE),
		db
			.select({ id: t.rewards.id, title: t.rewards.title, description: t.rewards.description })
			.from(t.rewards)
			.where(
				and(
					inScope(t.rewards, actorId, scope),
					sql`${t.rewards.ciphertext} is null`,
					after.rewards ? gt(t.rewards.id, after.rewards) : undefined
				)
			)
			.orderBy(asc(t.rewards.id))
			.limit(PAGE_SIZE),
		db
			.select({
				id: t.claims.id,
				rewardTitle: t.claims.rewardTitle,
				rewardDescription: t.claims.rewardDescription
			})
			.from(t.claims)
			.where(
				and(
					inScope(t.claims, actorId, scope),
					sql`${t.claims.snapshotCiphertext} is null`,
					after.claims ? gt(t.claims.id, after.claims) : undefined
				)
			)
			.orderBy(asc(t.claims.id))
			.limit(PAGE_SIZE)
	]);

	const cursor = (rows: { id: string }[]) =>
		rows.length === PAGE_SIZE ? (rows.at(-1)?.id ?? null) : null;
	const next: Cursors = {
		tasks: cursor(tasks),
		completions: cursor(completions),
		rewards: cursor(rewards),
		claims: cursor(claims),
		tags: cursor(tags)
	};
	return {
		tasks: tasks.map((row) => ({
			id: row.id,
			title: row.title ?? '',
			description: row.description,
			completionMessages: row.completionMessages ?? []
		})),
		completions: completions.map((row) => ({ ...row, taskTitle: row.taskTitle ?? '' })),
		rewards: rewards.map((row) => ({ ...row, title: row.title ?? '' })),
		claims: claims.map((row) => ({ ...row, rewardTitle: row.rewardTitle ?? '' })),
		tags,
		names,
		next: Object.values(next).some((value) => value !== null) ? next : null
	};
}

/**
 * Where the actor can read a partnership's names from, while they are not yet
 * in its vault: before sealing, in plaintext; after an invite was accepted,
 * still under its invite key. Null once they are in the vault.
 */
async function unsealedNames(
	db: Db,
	partnershipId: string,
	actorId: string
): Promise<PartnerNamesSource | null> {
	const [row] = await db
		.select({
			id: partnerships.id,
			status: partnerships.status,
			inviterId: partnerships.inviterId,
			inviteeId: partnerships.inviteeId,
			control: partnerships.control,
			inviterName: partnerships.inviterName,
			inviteeName: partnerships.inviteeName,
			inviterRole: partnerships.inviterRole,
			inviteeRole: partnerships.inviteeRole,
			namesCiphertext: partnerships.namesCiphertext,
			namesVaultId: partnerships.namesVaultId,
			namesPayloadVersion: partnerships.namesPayloadVersion,
			namesRevision: partnerships.namesRevision,
			inviteCiphertext: partnerships.inviteCiphertext,
			invitePayloadVersion: partnerships.invitePayloadVersion,
			inviteKeyWrap: partnerships.inviteKeyWrap
		})
		.from(partnerships)
		.where(eq(partnerships.id, partnershipId))
		.limit(1);
	const role = row ? roleOf(row, actorId) : null;
	if (!(row && role) || row.namesCiphertext !== null) {
		return null;
	}
	const source = namesSourceFor(row, role);
	return source.invite || source.legacy ? source : null;
}

/** A blind index as `blindIndex` produces it: full-length base64url HMAC-SHA256. */
const NAME_INDEX = /^[A-Za-z0-9_-]{43}$/;

/**
 * The tags in a batch whose names are free. Two tags made before sealing can
 * only collide now if a sealed tag of the same name was made since, or if
 * normalising made two different spellings one; either way the later one is
 * left in plaintext rather than failing the whole batch on the unique index —
 * and failing it again on every load after.
 */
async function withoutTakenNames<Row extends { nameIndex: string }>(
	db: Db,
	partnershipId: string,
	rows: Row[]
): Promise<Row[]> {
	if (rows.length === 0) {
		return rows;
	}
	const taken = await db
		.select({ nameIndex: messageTags.nameIndex })
		.from(messageTags)
		.where(
			and(
				eq(messageTags.partnershipId, partnershipId),
				inArray(
					messageTags.nameIndex,
					rows.map((row) => row.nameIndex)
				)
			)
		);
	const seen = new Set(taken.map((row) => row.nameIndex));
	return rows.filter((row) => {
		if (seen.has(row.nameIndex)) {
			return false;
		}
		seen.add(row.nameIndex);
		return true;
	});
}

/** A whole number in [0, max]: a count or an index, as the browser said it. */
function isCount(value: number, max: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= max;
}

export type SealedContentBatch = {
	vaultId: string;
	tasks: {
		id: string;
		ciphertext: string;
		payloadVersion: number;
		completionMessageCount: number;
	}[];
	/** Sealed as the task kind, to the completion's own id, with which message was picked. */
	completions: {
		id: string;
		ciphertext: string;
		payloadVersion: number;
		completionMessageIndex: number | null;
	}[];
	rewards: { id: string; ciphertext: string; payloadVersion: number }[];
	/** Sealed as the reward kind, to the claim's own id. */
	claims: { id: string; ciphertext: string; payloadVersion: number }[];
	/** A partnership's names, sealed in its vault. None for the self scope. */
	names?: { ciphertext: string; payloadVersion: number };
	/** A partnership's tags, each with the blind index of its name. None for the self scope. */
	tags?: { id: string; ciphertext: string; payloadVersion: number; nameIndex: string }[];
};

/**
 * Writes sealed copies of rows still in plaintext, and clears the plaintext.
 *
 * Each row at most once: only where it is still unsealed and in this scope,
 * and only under this scope's vault. Two devices sealing at once cannot
 * overwrite each other, and this cannot be used to change a sealed row. As
 * with any sealed write, the server cannot check the copy says what the
 * plaintext said.
 */
export async function sealUnsealedContent(
	db: Db,
	actorId: string,
	scope: ContentScope,
	batch: SealedContentBatch
): Promise<{ ok: true; sealed: number } | { ok: false; reason: 'not-found' | 'invalid' }> {
	const vaultId = await scopeVault(db, actorId, scope);
	if (!vaultId) {
		return { ok: false, reason: 'not-found' };
	}
	const batchTags = batch.tags ?? [];
	const acceptable =
		batch.vaultId === vaultId &&
		[...batch.tasks, ...batch.completions].every((row) =>
			sealedIsAcceptable(taskKind, row.ciphertext, row.payloadVersion)
		) &&
		[...batch.rewards, ...batch.claims].every((row) =>
			sealedIsAcceptable(rewardKind, row.ciphertext, row.payloadVersion)
		) &&
		(scope.kind === 'partnership' || (batchTags.length === 0 && !batch.names)) &&
		(!batch.names ||
			sealedIsAcceptable(
				partnershipNamesKind,
				batch.names.ciphertext,
				batch.names.payloadVersion
			)) &&
		batchTags.every(
			(row) =>
				sealedIsAcceptable(tagKind, row.ciphertext, row.payloadVersion) &&
				NAME_INDEX.test(row.nameIndex)
		) &&
		batch.tasks.every((row) => isCount(row.completionMessageCount, 20)) &&
		batch.completions.every(
			(row) => row.completionMessageIndex === null || isCount(row.completionMessageIndex, 19)
		);
	if (!acceptable) {
		return { ok: false, reason: 'invalid' };
	}

	const t = tablesFor(scope);
	const tags =
		scope.kind === 'partnership' ? await withoutTakenNames(db, scope.partnershipId, batchTags) : [];
	const updates = [
		...batch.tasks.map((row) =>
			db
				.update(t.tasks)
				.set({
					ciphertext: row.ciphertext,
					vaultId,
					payloadVersion: row.payloadVersion,
					completionMessageCount: row.completionMessageCount,
					revision: sql`${t.tasks.revision} + 1`,
					title: '',
					description: null,
					completionMessages: []
				})
				.where(
					and(
						eq(t.tasks.id, row.id),
						inScope(t.tasks, actorId, scope),
						sql`${t.tasks.ciphertext} is null`
					)
				)
				.returning({ id: t.tasks.id })
		),
		...batch.completions.map((row) =>
			db
				.update(t.completions)
				.set({
					snapshotCiphertext: row.ciphertext,
					snapshotVaultId: vaultId,
					snapshotVersion: row.payloadVersion,
					snapshotRecordId: row.id,
					completionMessageIndex: row.completionMessageIndex,
					taskTitle: '',
					taskDescription: null,
					completionMessage: null
				})
				.where(
					and(
						eq(t.completions.id, row.id),
						inScope(t.completions, actorId, scope),
						sql`${t.completions.snapshotCiphertext} is null`
					)
				)
				.returning({ id: t.completions.id })
		),
		...batch.rewards.map((row) =>
			db
				.update(t.rewards)
				.set({
					ciphertext: row.ciphertext,
					vaultId,
					payloadVersion: row.payloadVersion,
					revision: sql`${t.rewards.revision} + 1`,
					title: '',
					description: null
				})
				.where(
					and(
						eq(t.rewards.id, row.id),
						inScope(t.rewards, actorId, scope),
						sql`${t.rewards.ciphertext} is null`
					)
				)
				.returning({ id: t.rewards.id })
		),
		...batch.claims.map((row) =>
			db
				.update(t.claims)
				.set({
					snapshotCiphertext: row.ciphertext,
					snapshotVaultId: vaultId,
					snapshotVersion: row.payloadVersion,
					snapshotRecordId: row.id,
					rewardTitle: '',
					rewardDescription: null
				})
				.where(
					and(
						eq(t.claims.id, row.id),
						inScope(t.claims, actorId, scope),
						sql`${t.claims.snapshotCiphertext} is null`
					)
				)
				.returning({ id: t.claims.id })
		),
		...(scope.kind === 'partnership' && batch.names
			? [
					db
						.update(partnerships)
						.set({
							namesCiphertext: batch.names.ciphertext,
							namesVaultId: vaultId,
							namesPayloadVersion: batch.names.payloadVersion,
							namesRevision: sql`${partnerships.namesRevision} + 1`,
							inviterName: '',
							inviteeName: '',
							inviterRole: null,
							inviteeRole: null,
							inviteCiphertext: null,
							invitePayloadVersion: null,
							inviteKeyWrap: null
						})
						.where(
							and(
								eq(partnerships.id, scope.partnershipId),
								eq(partnerships.status, 'accepted'),
								sql`${partnerships.namesCiphertext} is null`
							)
						)
						.returning({ id: partnerships.id })
				]
			: []),
		...(scope.kind === 'partnership'
			? tags.map((row) =>
					db
						.update(messageTags)
						.set({
							ciphertext: row.ciphertext,
							vaultId,
							payloadVersion: row.payloadVersion,
							nameIndex: row.nameIndex,
							revision: sql`${messageTags.revision} + 1`,
							name: ''
						})
						.where(
							and(
								eq(messageTags.id, row.id),
								eq(messageTags.partnershipId, scope.partnershipId),
								sql`${messageTags.ciphertext} is null`
							)
						)
						.returning({ id: messageTags.id })
				)
			: [])
	];
	if (updates.length === 0) {
		return { ok: true, sealed: 0 };
	}
	const results = await db.batch(updates as [(typeof updates)[number], ...typeof updates]);
	return { ok: true, sealed: results.reduce((sum, rows) => sum + rows.length, 0) };
}
