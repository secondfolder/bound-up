import { and, asc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { PartnershipControl } from '../partnership';
import {
	managersFromControl,
	type SpaceKind,
	type SpaceMember,
	type SpaceMembership
} from '../spaces';
import type { Db } from './db';
import {
	daydreamCharacters,
	daydreamIdeas,
	daydreams,
	historyRestoreRequests,
	kinkLists,
	messageReactions,
	messages,
	messageTags,
	messageThreads,
	notebookEntries,
	partnerships,
	rewardBalances,
	rewardClaims,
	rewards,
	spaceMembers,
	spaces,
	taskCompletions,
	tasks,
	user,
	vaultEscrows,
	vaults
} from './db/schema';

/**
 * Every database access for spaces as such. See docs/spaces.md.
 *
 * A feature still reads its own rows by its own columns; what lives here is
 * who is in a space, whether they manage it, which space is someone's own,
 * and taking a space away with everything in it.
 */

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

/** Whether `userId` is a member of the space whose id is in `spaceId` (a column or a value). */
export function isSpaceMember(spaceId: SQLiteColumn | string, userId: string): SQL {
	// `IN (subquery)` rather than a correlated EXISTS, so SQLite reads the
	// user's few memberships by `space_members_user_id_idx` and then looks the
	// outer rows up by key, instead of testing every outer row.
	return sql`${spaceId} in (select ${spaceMembers.spaceId} from ${spaceMembers} where ${spaceMembers.userId} = ${userId})`;
}

/** The id of `userId`'s solo space, as a subquery, for a write to take it without a read first. */
export function soloSpaceIdOf(userId: string): SQL<string | null> {
	return sql<string | null>`(select ${spaceMembers.spaceId} from ${spaceMembers}
		inner join ${spaces} on ${spaces.id} = ${spaceMembers.spaceId}
		where ${spaceMembers.userId} = ${userId} and ${spaces.kind} = 'solo')`;
}

/**
 * The partnership's `control`, as its space's members' `can_manage` says it.
 *
 * Every read of `control` goes through this rather than the column, so
 * `can_manage` is what the permission rules actually follow while they are
 * still written in terms of `control`. A pending invite has one member, so
 * what it offers the invitee can only be read from the row's own `control`,
 * which is part of the invite (docs/spaces.md, "Still pair-shaped").
 */
export function partnershipControl(): SQL<PartnershipControl> {
	const manages = (who: SQLiteColumn) =>
		sql`exists (select 1 from ${spaceMembers} where ${spaceMembers.spaceId} = ${partnerships.id}
			and ${spaceMembers.userId} = ${who} and ${spaceMembers.canManage} = 1)`;
	return sql<PartnershipControl>`(case
		when ${partnerships.status} <> 'accepted' then ${partnerships.control}
		when ${manages(partnerships.inviterId)} and ${manages(partnerships.inviteeId)} then 'both'
		when ${manages(partnerships.inviterId)} then 'inviter'
		else 'invitee' end)`;
}

/** The space `userId` is in, and what they may do there, or null when they are not in it. */
export async function requireSpaceMember(
	db: Db,
	spaceId: string,
	userId: string
): Promise<SpaceMembership | null> {
	const [row] = await db
		.select({ spaceId: spaces.id, kind: spaces.kind, canManage: spaceMembers.canManage })
		.from(spaceMembers)
		.innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
		.where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
		.limit(1);
	return row ?? null;
}

/**
 * Every space `userId` is in: their solo space first, then shared ones oldest
 * first. A pending invite's space is included — its inviter is already a
 * member — so a caller that wants linked partnerships only still checks the
 * partnership's status.
 */
export async function listSpacesForUser(db: Db, userId: string): Promise<SpaceMembership[]> {
	return await db
		.select({ spaceId: spaces.id, kind: spaces.kind, canManage: spaceMembers.canManage })
		.from(spaceMembers)
		.innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
		.where(eq(spaceMembers.userId, userId))
		.orderBy(sql`${spaces.kind} = 'shared'`, spaces.createdAt, spaces.id);
}

/** A member of a space as the task and reward pages need them: with the time zone their dates are in. */
export type ItemSpaceMember = SpaceMember & { timezone: string };

/** A space the viewer is in, with every member, for the task and reward rules (`SpaceForRules`). */
export type ItemSpace = { id: string; kind: SpaceKind; members: ItemSpaceMember[] };

/**
 * The spaces among `spaceIds` that `viewerId` is in and that have something in
 * them to show — their solo space, and each partnership once it is accepted —
 * with all their members. One query for a page's spaces, however many the
 * context shows. Spaces the viewer is not in are simply missing, so a caller
 * that names one by id treats a miss as "not found".
 */
export async function loadItemSpaces(
	db: Db,
	viewerId: string,
	spaceIds: readonly string[]
): Promise<Map<string, ItemSpace>> {
	const found = new Map<string, ItemSpace>();
	// `in ()` is a syntax error in SQLite.
	if (spaceIds.length === 0) {
		return found;
	}
	const rows = await db
		.select({
			spaceId: spaceMembers.spaceId,
			kind: spaces.kind,
			userId: spaceMembers.userId,
			canManage: spaceMembers.canManage,
			timezone: user.timezone
		})
		.from(spaceMembers)
		.innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
		.innerJoin(user, eq(user.id, spaceMembers.userId))
		.leftJoin(partnerships, eq(partnerships.id, spaces.id))
		.where(
			and(
				inArray(spaceMembers.spaceId, [...spaceIds]),
				isSpaceMember(spaceMembers.spaceId, viewerId),
				or(eq(spaces.kind, 'solo' satisfies SpaceKind), eq(partnerships.status, 'accepted'))
			)
		)
		.orderBy(asc(spaceMembers.createdAt), asc(spaceMembers.id));
	for (const row of rows) {
		const space = found.get(row.spaceId) ?? { id: row.spaceId, kind: row.kind, members: [] };
		space.members.push({ userId: row.userId, canManage: row.canManage, timezone: row.timezone });
		found.set(row.spaceId, space);
	}
	return found;
}

/** One space as `loadItemSpaces` has it, or null when the viewer is not in it. */
export async function loadItemSpace(
	db: Db,
	viewerId: string,
	spaceId: string
): Promise<ItemSpace | null> {
	return (await loadItemSpaces(db, viewerId, [spaceId])).get(spaceId) ?? null;
}

/**
 * `userId`'s solo space. Every account has one from the moment it exists —
 * the `user_has_solo_space` trigger makes it — so null means the account
 * does not exist.
 */
export async function soloSpaceFor(db: Db, userId: string): Promise<string | null> {
	const [row] = await db
		.select({ id: spaceMembers.spaceId })
		.from(spaceMembers)
		.innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
		.where(and(eq(spaceMembers.userId, userId), eq(spaces.kind, 'solo' satisfies SpaceKind)))
		.limit(1);
	return row?.id ?? null;
}

/** Whether any space — anyone's — has this id. For telling a taken id from a failed write. */
export async function spaceExists(db: Db, spaceId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: spaces.id })
		.from(spaces)
		.where(eq(spaces.id, spaceId))
		.limit(1);
	return row !== undefined;
}

/**
 * The statements that make a partnership's shared space, under the
 * partnership's id, with the inviter as its one member. For the caller to
 * batch with the partnership's own insert, after it: the member row is
 * written only if that partnership is this inviter's, so an id that turns
 * out to be taken never makes anyone a member of someone else's space.
 *
 * The space insert has no ON CONFLICT on purpose. A browser chooses the id,
 * and a space by that id that already exists — anyone's solo space, say —
 * must fail the whole batch, never be joined.
 */
export function createSharedSpace(
	db: Db,
	partnership: { id: string; inviterId: string; control: PartnershipControl }
): Batch {
	const [inviter] = managersFromControl(partnership.control, {
		inviterId: partnership.inviterId,
		inviteeId: null
	});
	return [
		db.insert(spaces).values({ id: partnership.id, kind: 'shared' }),
		db.insert(spaceMembers).select(
			db
				.select({
					id: sql<string>`${crypto.randomUUID()}`.as('id'),
					spaceId: partnerships.id,
					userId: partnerships.inviterId,
					canManage: sql<boolean>`${inviter?.canManage ? 1 : 0}`.as('can_manage'),
					// Every column, in order, is what an insert from a select takes.
					colour: sql<null>`null`.as('colour'),
					createdAt: sql<Date>`${Date.now()}`.as('created_at'),
					updatedAt: sql<Date>`${Date.now()}`.as('updated_at')
				})
				.from(partnerships)
				.where(
					and(
						eq(partnerships.id, partnership.id),
						eq(partnerships.inviterId, partnership.inviterId)
					)
				)
		)
	];
}

/**
 * Brings a shared space's members into line with its partnership row: adds
 * the invitee once there is one, and sets every member's `can_manage` from
 * `control`. For the caller to batch after any write to the row's invitee or
 * control, so the two never disagree.
 *
 * LEGACY-SPACES: `partnerships.control` is still written because the
 * partner settings form, the invite it offers and the task, reward and
 * notebook rules are written in terms of it. Reads take it back from
 * `can_manage` (`partnershipControl`). When those rules are written against
 * members, the column and this sync go. See docs/temporary-code.md.
 *
 * Reads the row inside the statements rather than taking values, so a write
 * that matched nothing — an invite accepted by someone else a moment
 * earlier — leaves the members exactly as they were.
 */
export function syncSharedSpaceMembers(db: Db, partnershipId: string): Batch {
	const now = Date.now();
	return [
		db
			.insert(spaceMembers)
			.select(
				db
					.select({
						id: sql<string>`${crypto.randomUUID()}`.as('id'),
						spaceId: partnerships.id,
						userId: sql<string>`${partnerships.inviteeId}`.as('user_id'),
						canManage: sql<boolean>`0`.as('can_manage'),
						colour: sql<null>`null`.as('colour'),
						createdAt: sql<Date>`${now}`.as('created_at'),
						updatedAt: sql<Date>`${now}`.as('updated_at')
					})
					.from(partnerships)
					.where(
						and(eq(partnerships.id, partnershipId), sql`${partnerships.inviteeId} is not null`)
					)
			)
			.onConflictDoNothing(),
		db
			.update(spaceMembers)
			.set({
				canManage: sql`(select case ${partnerships.control}
					when 'both' then 1
					when 'inviter' then ${spaceMembers.userId} = ${partnerships.inviterId}
					else ${spaceMembers.userId} = ${partnerships.inviteeId} end
					from ${partnerships} where ${partnerships.id} = ${spaceMembers.spaceId})`,
				updatedAt: new Date(now)
			})
			.where(eq(spaceMembers.spaceId, partnershipId))
	];
}

/**
 * The statements that delete a space and everything in it, for one batch.
 *
 * Explicit, table by table, because most of it does not cascade from
 * `spaces`: the `space_id` columns added to tables that already existed got
 * no `ON DELETE` (a column added by `ALTER TABLE … REFERENCES` never does —
 * the trap in AGENTS.md). The same trap means a vault's deletion does not
 * cascade to everything sealed under it either — only to the tables that
 * were created with their `vault_id`. Messages, reactions and tags had theirs
 * added later, so their foreign key is NO ACTION and a vault cannot go while
 * any of them point at it.
 *
 * Tasks, rewards, their completions, claims and balances were created with
 * `space_id` and a real cascade, so the space's own deletion would take them;
 * they are deleted here all the same, children first, so this list says
 * everything a space holds and does not lean on which tables happen to
 * cascade.
 *
 * So, in order: the rows that carry the space, then the rows sealed under its
 * vaults whose foreign key would refuse the vault's deletion, then the
 * partnership row (for a shared space: it is the space's details), then the
 * vaults, the members and the space.
 *
 * `spaces.test.ts` fails if a table gains a `space_id` that this misses.
 */
export function deleteSpaceStatements(db: Db, spaceId: string): Batch {
	const spaceVaults = db.select({ id: vaults.id }).from(vaults).where(eq(vaults.spaceId, spaceId));
	return [
		db.delete(historyRestoreRequests).where(eq(historyRestoreRequests.spaceId, spaceId)),
		db.delete(vaultEscrows).where(eq(vaultEscrows.spaceId, spaceId)),
		db.delete(messageThreads).where(eq(messageThreads.spaceId, spaceId)),
		db.delete(messageTags).where(eq(messageTags.spaceId, spaceId)),
		db.delete(notebookEntries).where(eq(notebookEntries.spaceId, spaceId)),
		db.delete(kinkLists).where(eq(kinkLists.spaceId, spaceId)),
		db.delete(daydreams).where(eq(daydreams.spaceId, spaceId)),
		db.delete(daydreamCharacters).where(eq(daydreamCharacters.spaceId, spaceId)),
		db.delete(daydreamIdeas).where(eq(daydreamIdeas.spaceId, spaceId)),
		db.delete(taskCompletions).where(eq(taskCompletions.spaceId, spaceId)),
		db.delete(rewardClaims).where(eq(rewardClaims.spaceId, spaceId)),
		db.delete(tasks).where(eq(tasks.spaceId, spaceId)),
		db.delete(rewards).where(eq(rewards.spaceId, spaceId)),
		db.delete(rewardBalances).where(eq(rewardBalances.spaceId, spaceId)),
		// Sealed under the space's vaults with a NO ACTION key; see above.
		db.delete(messageReactions).where(inArray(messageReactions.vaultId, spaceVaults)),
		db.delete(messages).where(inArray(messages.vaultId, spaceVaults)),
		db.delete(messageTags).where(inArray(messageTags.vaultId, spaceVaults)),
		db.delete(partnerships).where(eq(partnerships.id, spaceId)),
		db.delete(vaults).where(eq(vaults.spaceId, spaceId)),
		db.delete(spaceMembers).where(eq(spaceMembers.spaceId, spaceId)),
		db.delete(spaces).where(eq(spaces.id, spaceId))
	];
}

/** Deletes a space and everything in it. The caller has already decided this viewer may. */
export async function deleteSpace(db: Db, spaceId: string): Promise<void> {
	await db.batch(deleteSpaceStatements(db, spaceId));
}

/**
 * The statements that delete every space `userId` is in — their solo space,
 * and every shared space, which is what ending all their partnerships is.
 * For the account's own deletion, which then deletes the `user` row; the
 * cascades from `user` cannot reach a space, which has no owner column.
 */
export async function deleteSpacesOfUserStatements(db: Db, userId: string): Promise<Batch | null> {
	const memberships = await db
		.select({ spaceId: spaceMembers.spaceId })
		.from(spaceMembers)
		.where(eq(spaceMembers.userId, userId));
	const statements = memberships.flatMap(({ spaceId }) => deleteSpaceStatements(db, spaceId));
	const [first, ...rest] = statements;
	return first ? [first, ...rest] : null;
}

/**
 * Deletes an account, and every space it is in first, in one batch. For the
 * app's own account deletion (a sign-up whose keys could not be stored).
 * Better Auth's deletion paths reach the same statements through the
 * `user.delete.before` hook in `auth.ts`.
 */
export async function deleteAccount(db: Db, userId: string): Promise<void> {
	const spaceStatements = (await deleteSpacesOfUserStatements(db, userId)) ?? [];
	await db.batch([...spaceStatements, db.delete(user).where(eq(user.id, userId))]);
}
