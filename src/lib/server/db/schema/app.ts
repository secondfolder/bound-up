import { relations, sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import type { DaydreamTurnRole } from '../../../daydream';
import type { AccountRecoveryStatus, KeyWrapParams, KeyWrapType } from '../../../encryption';
import type { FeatureKey, FeatureSource } from '../../../features';
import type { RestoreRequestStatus, ThreadIcon } from '../../../messaging';
import type { AdultLevel, ProviderKind, ProviderOverride } from '../../../model-providers';
import type { NotebookKind, PartnerAccess } from '../../../notebook';
import type { PartnershipControl, PartnershipStatus } from '../../../partnership';
import type { Intensity, Role, Vibe } from '../../../playroom/iq-test/settings';
import type { ServerSettingKey, ServerSettingSource } from '../../../server-settings';
import type { SpaceColour } from '../../../space-colours';
import type { SpaceKind } from '../../../spaces';
import type { EdgeTaskInstructions, TaskSchedule } from '../../../types';
import type { VaultKind } from '../../../vault';
import { user } from './auth';

/**
 * Timestamp columns.
 *
 * `mode: 'timestamp_ms'` stores unix *milliseconds* and maps to `Date` in JS.
 * This deliberately matches what the Better Auth CLI generates for SQLite, so
 * both halves of the schema round-trip `Date` identically — a mismatch here
 * would make every date in one half 1000x off.
 *
 * The default is expressed in SQL rather than with `$defaultFn` so that raw
 * `wrangler d1 execute --command "INSERT ..."` also produces valid rows. The
 * expression is copied verbatim from what the Better Auth CLI emits, so the two
 * schema files agree down to the default.
 */
const timestamps = {
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
};

/**
 * The columns of a row whose content is a sealed record (docs/encryption.md,
 * "Sealed records"): the ciphertext, the vault it is sealed under, the payload
 * version, and a revision that every write bumps, so an edit or a background
 * upgrade can be compare-and-swap and never overwrite a newer write.
 *
 * Ciphertext and vault are nullable only because rows from before sealing had
 * none; every row has them now and every writer sets them. Making them NOT
 * NULL means rebuilding the table, which on D1 cascade-deletes every row that
 * references it (see the trap in AGENTS.md), so the code holds the line.
 */
function sealedContent() {
	return {
		ciphertext: text('ciphertext'),
		vaultId: text('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version'),
		revision: integer('revision').notNull().default(0)
	};
}

/**
 * What a task completion changed on its task, as it was before, so the
 * completion can be undone exactly (docs/tasks.md, "Undoing a completion").
 *
 * Stored rather than recomputed: a scheduled task's next occurrence cannot be
 * rebuilt once its schedule has been edited, and a one-off's `active` is lost
 * the moment it completes. `previous_active` is NULL only on completions
 * recorded before these columns existed, which are not undoable.
 */
function undoState() {
	return {
		previousActive: integer('previous_active', { mode: 'boolean' }),
		previousNextEligibleAt: integer('previous_next_eligible_at', { mode: 'timestamp_ms' }),
		previousLastCompletedAt: integer('previous_last_completed_at', { mode: 'timestamp_ms' })
	};
}

export const guides = sqliteTable('guides', {
	// Text ids to match Better Auth's own tables, so any future foreign key
	// between app data and `user.id` is type-consistent. `crypto.randomUUID` is
	// a global in workerd and in Node >= 19, so this needs no dependency.
	// NOTE: this default is JS-side only, so raw SQL inserts must supply `id`.
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	title: text('title').notNull(),
	...timestamps
});

export const edgeTasks = sqliteTable(
	'edge_tasks',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		guideId: text('guide_id')
			.notNull()
			.references(() => guides.id, { onDelete: 'cascade' }),
		/** Sequence position within the guide. Order by this, never by `id`. */
		order: integer('order').notNull().default(0),
		// SQLite has no JSON type. `mode: 'json'` handles parse/stringify and
		// `$type` gives the shape real end-to-end typing.
		instructions: text('instructions', { mode: 'json' }).$type<EdgeTaskInstructions>().notNull(),
		...timestamps
	},
	(table) => [
		// The /guides/[id] load's hot path: where guide_id = ? order by "order".
		index('edge_tasks_guide_id_order_idx').on(table.guideId, table.order)
	]
);

export const guidesRelations = relations(guides, ({ many }) => ({
	edgeTasks: many(edgeTasks)
}));

export const edgeTasksRelations = relations(edgeTasks, ({ one }) => ({
	guide: one(guides, {
		fields: [edgeTasks.guideId],
		references: [guides.id]
	})
}));

export type Guide = typeof guides.$inferSelect;
export type NewGuide = typeof guides.$inferInsert;
export type EdgeTask = typeof edgeTasks.$inferSelect;
export type NewEdgeTask = typeof edgeTasks.$inferInsert;

/**
 * A link between two accounts.
 *
 * One row per link, not one per direction: the two labels and the single
 * control setting are properties of the *relationship*, so storing them twice
 * would create two rows that can silently disagree. Everything a screen needs
 * per-viewer is derived at read time by `viewPartnership()` in
 * `src/lib/partnership.ts`.
 *
 * `inviterId`/`inviteeId` keep their meaning after acceptance — they are not
 * just plumbing for the invite. `control` is stored relative to those roles
 * ('inviter' = the person who sent the invite is in control) precisely because
 * the roles are permanent, so a row read from either side means the same thing.
 */
export const partnerships = sqliteTable(
	'partnerships',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		/** Who sent the invite. Never changes. */
		inviterId: text('inviter_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Who accepted it. NULL exactly while `status` is 'pending'. */
		inviteeId: text('invitee_id').references(() => user.id, { onDelete: 'cascade' }),
		status: text('status').$type<PartnershipStatus>().notNull().default('pending'),
		/**
		 * The invite's offer: who will manage the partnership once it is
		 * accepted, against the inviter/invitee roles. Read only while the
		 * invite is pending and at the moment it is accepted, when it sets the
		 * members' `space_members.can_manage`; once accepted it records what
		 * was agreed then, is never written again, and is never a permission —
		 * changing control afterwards writes `can_manage` alone. See
		 * docs/partners.md, "Control".
		 */
		control: text('control').$type<PartnershipControl>().notNull(),
		/**
		 * The secret in the invite URL, stored in the clear rather than hashed.
		 *
		 * Hashing would mean the inviter could never be shown the link again, and
		 * re-copying an already-sent link is a requirement. Better Auth stores
		 * `session.token` the same way, so this adds no capability an attacker
		 * with read access to the database would not already have. Cleared on
		 * accept so a consumed link cannot be replayed.
		 */
		inviteToken: text('invite_token').unique(),
		inviteExpiresAt: integer('invite_expires_at', { mode: 'timestamp_ms' }),
		acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
		/**
		 * The names and roles, sealed in the partnership's vault (kind
		 * `partnership-names`). No foreign key on the vault: the vault and this
		 * row go together, with the partnership. See docs/partners.md, "Names
		 * are sealed".
		 */
		namesCiphertext: text('names_ciphertext'),
		namesVaultId: text('names_vault_id'),
		namesPayloadVersion: integer('names_payload_version'),
		/** Bumped by every write of the sealed names, for compare-and-swap. */
		namesRevision: integer('names_revision').notNull().default(0),
		/**
		 * The invite, sealed under the invite key that travels in the link's
		 * fragment (kind `partnership-invite`): the names before there is a
		 * vault to put them in. Kept past acceptance until a member's device has
		 * moved the names into the vault, then cleared.
		 */
		inviteCiphertext: text('invite_ciphertext'),
		invitePayloadVersion: integer('invite_payload_version'),
		/**
		 * The invite key, age-encrypted to the inviter's own recipient, so the
		 * inviter's devices can show the pending invite and copy its link again.
		 * Cleared with the invite.
		 */
		inviteKeyWrap: text('invite_key_wrap'),
		...timestamps
	},
	(table) => [
		// The bottom nav queries "every accepted partnership I am in" on every
		// page in the app shell, from either side, hence one index per side.
		index('partnerships_inviter_id_idx').on(table.inviterId),
		index('partnerships_invitee_id_idx').on(table.inviteeId)
	]
);

// No `relations()` for partnerships on purpose. Two foreign keys point at the
// same table, which drizzle's relational query API can only disambiguate with a
// `relationName` declared on BOTH sides — and the `user` side lives in the
// generated `schema/auth.ts`, where an edit would be lost on the next
// `npm run auth:schema`. Partner rows are read with explicit aliased joins
// instead; see `src/lib/server/partnerships.ts`.

export type Partnership = typeof partnerships.$inferSelect;
export type NewPartnership = typeof partnerships.$inferInsert;

/**
 * Where scoped data lives: one person's own space, or one shared by the
 * members of a partnership. See docs/spaces.md.
 *
 * Every account has exactly one `solo` space, made by a trigger on `user`
 * (drizzle/*_backfill_spaces.sql) so it holds however the account is created.
 * A partnership's `shared` space has the partnership's own id, so a
 * `partnership_id` anywhere is already the id of its space; the partnership
 * row stays as the shared space's details — the invite, the sealed names.
 *
 * Nothing about a space is content, so there is nothing here but its kind.
 */
export const spaces = sqliteTable('spaces', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	kind: text('kind').$type<SpaceKind>().notNull(),
	...timestamps
});

/**
 * Who is in a space, and whether they manage it.
 *
 * `can_manage` is what every permission reads: a flag per member rather than
 * an inviter/invitee/both enum, so nothing in the database assumes a space
 * has two members. A partnership's `control` is only its invite's offer,
 * which sets these flags when the invite is made and when it is accepted.
 */
export const spaceMembers = sqliteTable(
	'space_members',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		spaceId: text('space_id')
			.notNull()
			.references(() => spaces.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		canManage: integer('can_manage', { mode: 'boolean' }).notNull(),
		/**
		 * How this member sees the space: their own choice of colour for it, from
		 * the closed list in `space-colours.ts`, or null for the one assigned by
		 * order. Per member, never shown to the others, and a closed list rather
		 * than free text so a plaintext column cannot carry anything else. See
		 * docs/contexts.md.
		 */
		colour: text('colour').$type<SpaceColour>(),
		...timestamps
	},
	(table) => [
		uniqueIndex('space_members_space_user_idx').on(table.spaceId, table.userId),
		// "Which spaces am I in" — every membership check and the solo-space lookup.
		index('space_members_user_id_idx').on(table.userId)
	]
);

export type Space = typeof spaces.$inferSelect;
export type NewSpace = typeof spaces.$inferInsert;
export type SpaceMemberRow = typeof spaceMembers.$inferSelect;
export type NewSpaceMemberRow = typeof spaceMembers.$inferInsert;

/**
 * A space a row belongs to. Nullable, with no `ON DELETE`, because it is
 * added to tables that already exist: making it NOT NULL, or giving it an
 * action, means rebuilding the table, which on D1 cascade-deletes everything
 * referencing it (the trap in AGENTS.md). Every writer sets it, and deleting
 * a space deletes its rows explicitly (`deleteSpace` in `server/spaces.ts`).
 */
function spaceColumn() {
	return text('space_id').references(() => spaces.id);
}

/**
 * The sealed content of a task or reward: NOT NULL, unlike `sealedContent()`'s,
 * because these tables were made after every task and reward was sealed
 * (production read zero unsealed rows on 2026-10-27, before the copy into
 * them). A proper `ON DELETE CASCADE` on the vault too, since these tables
 * were created with it rather than given it by `ALTER TABLE`.
 */
function sealedRecord() {
	return {
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		revision: integer('revision').notNull().default(0)
	};
}

/**
 * A copy of a sealed record, taken when a task is completed or a reward
 * claimed, so the history says what it said at the time. The copy is the
 * ciphertext itself — the person completing or claiming need not be its
 * author, and cannot re-seal what they did not write — so it stays bound to
 * the record it was sealed as: `snapshot_record_id`. NOT NULL as
 * `sealedRecord()`'s are.
 */
function sealedRecordCopy() {
	return {
		snapshotCiphertext: text('snapshot_ciphertext').notNull(),
		snapshotVaultId: text('snapshot_vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		snapshotVersion: integer('snapshot_version').notNull(),
		snapshotRecordId: text('snapshot_record_id').notNull()
	};
}

/**
 * The space a task, a reward, or something about one belongs to. NOT NULL with
 * a real `ON DELETE CASCADE`, unlike `spaceColumn()`: these tables were created
 * with it, so deleting a space takes them with it on D1 too.
 */
function ownSpaceColumn() {
	return text('space_id')
		.notNull()
		.references(() => spaces.id, { onDelete: 'cascade' });
}

/**
 * A task: a piece of work that earns credits, in one space. See docs/tasks.md.
 *
 * One table for a person's own tasks and the ones partners set each other,
 * told apart by their space rather than by a table each (they were two until
 * 0052 copied them here). Who may do what follows from the space's members
 * and two columns:
 *
 * - `createdByUserId` wrote it. Set on a solo task too, to its owner.
 * - `assigneeUserId` completes it and is paid for it: the owner in a solo
 *   space, and in a shared one the member it was set for — never its creator,
 *   which is the authorship rule (nobody completes what they wrote). Nullable
 *   so a space of more than two can one day have a task nobody has taken yet;
 *   every writer sets it today, and a task with none is nobody's to complete.
 *
 * `timezoneOwnerUserId` points at whose local time the schedule's dates are
 * in, so a later change of time zone keeps that relationship.
 */
export const tasks = sqliteTable(
	'tasks',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		spaceId: ownSpaceColumn(),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		assigneeUserId: text('assignee_user_id').references(() => user.id, { onDelete: 'cascade' }),
		timezoneOwnerUserId: text('timezone_owner_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		creditsAwarded: integer('credits_awarded').notNull().default(0),
		/**
		 * How many completion messages the sealed content holds. Plaintext so the
		 * server can still pick one at random on completion — an index, which the
		 * reader looks up after opening the snapshot.
		 */
		completionMessageCount: integer('completion_message_count').notNull().default(0),
		...sealedRecord(),
		schedule: text('schedule', { mode: 'json' }).$type<TaskSchedule>().notNull(),
		lastCompletedAt: integer('last_completed_at', { mode: 'timestamp_ms' }),
		completedCount: integer('completed_count').notNull().default(0),
		nextEligibleAt: integer('next_eligible_at', { mode: 'timestamp_ms' }),
		...timestamps
	},
	(table) => [
		// Every list: "the tasks in these spaces", active first.
		index('tasks_space_active_idx').on(table.spaceId, table.active),
		// The cards: "the active tasks in these spaces, soonest due first".
		index('tasks_space_next_eligible_idx').on(table.spaceId, table.nextEligibleAt),
		index('tasks_assignee_idx').on(table.assigneeUserId),
		index('tasks_creator_idx').on(table.createdByUserId),
		index('tasks_timezone_owner_idx').on(table.timezoneOwnerUserId),
		// A lost vault's contents are deleted by it (`deleteLostSelfVault`).
		index('tasks_vault_idx').on(table.vaultId)
	]
);

/**
 * One completion of a task.
 *
 * The task's sealed record is copied as it was (`snapshot_*`), with which of
 * its completion messages was given and the award, so history stays truthful
 * if the task is edited later. `createdByUserId` is the task's author, copied
 * so history can say whose task it was without the live row.
 */
export const taskCompletions = sqliteTable(
	'task_completions',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		spaceId: ownSpaceColumn(),
		taskId: text('task_id')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		completedByUserId: text('completed_by_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		creditsAwarded: integer('credits_awarded').notNull(),
		/** Which of the snapshot's completion messages was picked, or NULL for none. */
		completionMessageIndex: integer('completion_message_index'),
		...sealedRecordCopy(),
		...undoState(),
		...timestamps
	},
	(table) => [
		// History: "the completions in these spaces, newest first".
		index('task_completions_space_created_idx').on(table.spaceId, table.createdAt),
		// A task's newest completion (undo), and its window's completions ("1 left").
		index('task_completions_task_created_idx').on(table.taskId, table.createdAt),
		index('task_completions_completed_by_idx').on(table.completedByUserId),
		index('task_completions_snapshot_vault_idx').on(table.snapshotVaultId)
	]
);

/**
 * A reward: something credits buy, in one space. See docs/rewards.md.
 *
 * One table for both kinds, as `tasks` is, with the same two people:
 * `createdByUserId` wrote it, and `assigneeUserId` is who claims it — the
 * owner in a solo space, the member it was set for in a shared one, never its
 * creator. It is paid from the assignee's balance in the same space
 * (`reward_balances`).
 */
export const rewards = sqliteTable(
	'rewards',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		spaceId: ownSpaceColumn(),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Who claims it. Nullable for the reason `tasks.assignee_user_id` is. */
		assigneeUserId: text('assignee_user_id').references(() => user.id, { onDelete: 'cascade' }),
		cost: integer('cost').notNull(),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		...sealedRecord(),
		...timestamps
	},
	(table) => [
		index('rewards_space_active_idx').on(table.spaceId, table.active),
		index('rewards_assignee_idx').on(table.assigneeUserId),
		index('rewards_creator_idx').on(table.createdByUserId),
		index('rewards_vault_idx').on(table.vaultId)
	]
);

/**
 * One claim of a reward: its sealed record and cost as they were, so history
 * does not change when the reward does, and whose reward it was.
 */
export const rewardClaims = sqliteTable(
	'reward_claims',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		spaceId: ownSpaceColumn(),
		rewardId: text('reward_id')
			.notNull()
			.references(() => rewards.id, { onDelete: 'cascade' }),
		claimedByUserId: text('claimed_by_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		rewardCost: integer('reward_cost').notNull(),
		...sealedRecordCopy(),
		...timestamps
	},
	(table) => [
		index('reward_claims_space_created_idx').on(table.spaceId, table.createdAt),
		index('reward_claims_reward_idx').on(table.rewardId),
		index('reward_claims_claimed_by_idx').on(table.claimedByUserId),
		index('reward_claims_snapshot_vault_idx').on(table.snapshotVaultId)
	]
);

/**
 * One member's credits in one space: a wallet. Never pooled — a space's
 * credits buy that space's rewards and nothing else — so there is one row per
 * (space, member), and none until something is credited or set.
 */
export const rewardBalances = sqliteTable(
	'reward_balances',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		spaceId: ownSpaceColumn(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		credits: integer('credits').notNull().default(0),
		...timestamps
	},
	(table) => [
		uniqueIndex('reward_balances_space_user_idx').on(table.spaceId, table.userId),
		index('reward_balances_user_idx').on(table.userId)
	]
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type TaskCompletionRow = typeof taskCompletions.$inferSelect;
export type NewTaskCompletionRow = typeof taskCompletions.$inferInsert;
export type RewardRow = typeof rewards.$inferSelect;
export type NewRewardRow = typeof rewards.$inferInsert;
export type RewardClaimRow = typeof rewardClaims.$inferSelect;
export type NewRewardClaimRow = typeof rewardClaims.$inferInsert;
export type RewardBalanceRow = typeof rewardBalances.$inferSelect;
export type NewRewardBalanceRow = typeof rewardBalances.$inferInsert;

/**
 * A user's long-term age recipient — their public key.
 *
 * Stored in the clear because it is public by construction: everything a
 * partner needs to encrypt *to* this user, and nothing that decrypts anything.
 *
 * One row per user. The recipient is replaced only in one situation — a
 * partner-assisted sign-in, after someone has lost every way into their
 * account, which loses the identity for good (see docs/account-recovery.md).
 * Ordinary use never rotates it, because the server holds ciphertext only and
 * there would be nothing to re-encrypt from.
 *
 * There is deliberately no `generation` or `rotatedAt` column. Everything on
 * this row is server-controlled, so a client could not use such a column to
 * decide whether a key change was legitimate — that decision is made against a
 * locally pinned copy (see `pinStateFor` in `src/lib/encryption.ts`), and a
 * column here would only look as though it helped.
 */
export const userKeys = sqliteTable('user_keys', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	// Unique rather than being the primary key, to match the id-plus-unique
	// shape of every other table here. The constraint doubles as the index for
	// the only query path there is: "this user's recipient".
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	/** `age1...`, bech32. Public. */
	recipient: text('recipient').notNull(),
	...timestamps
});

/**
 * One way to unlock a user's age identity. Many rows per user, on purpose.
 *
 * The server stores a `type`, an opaque `params` blob it never reads, and the
 * ciphertext. That is the whole extension point: another unlock method is a new
 * `type` and new client code, not a migration.
 *
 * `params` is JSON for the same reason the `edge_tasks.instructions` column is:
 * SQLite has no
 * JSON type, `mode: 'json'` handles the round trip, and `$type` gives it
 * end-to-end typing without the server needing to understand the contents.
 *
 * NOTE: there is deliberately NO unique index on (user_id, type). Two password
 * wraps existing at once is a required transient state — a password change
 * inserts the new wrap *before* changing the credential, so that a crash
 * between the two leaves two wraps of which exactly one opens, rather than none.
 * Adding that index would break password changes in a way that only shows up
 * when a request dies half way through.
 */
export const userKeyWraps = sqliteTable(
	'user_key_wraps',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		type: text('type').$type<KeyWrapType>().notNull(),
		params: text('params', { mode: 'json' }).$type<KeyWrapParams>().notNull(),
		/**
		 * base64url of a ciphertext this server has no key for: `12-byte IV ||
		 * AES-256-GCM || 16-byte tag` for every type. What differs is where the
		 * key came from — a password, a passkey's PRF output or a secret kept in
		 * a passkey's user handle — and nothing here reads either.
		 */
		blob: text('blob').notNull(),
		/** User-facing, e.g. "iPhone passkey". */
		label: text('label'),
		...timestamps
	},
	// Every read is "all wraps for this user"; unlock tries them in turn.
	(table) => [index('user_key_wraps_user_id_idx').on(table.userId)]
);

/**
 * One key that a space's user data is sealed under: a user's own, or a
 * partnership's. See docs/encryption.md, "Vaults".
 *
 * A vault belongs to a space (`space_id`) but is not the space itself: its id
 * is bound into every ciphertext sealed under it, and a space that ever loses
 * a member will need a new key — a new vault — while staying the same space
 * (docs/spaces.md).
 *
 * The key itself is never here. What the server holds is a public fingerprint
 * of it (`key_check`) and, in `vault_wraps`, a copy of it encrypted to each
 * member. The id is chosen by the browser, because the wraps — and everything
 * later sealed under the key — are bound to it before this row exists.
 *
 * One vault per scope, enforced by the two unique columns: two devices that
 * both find a partnership without one race to create it, and the loser's
 * insert fails rather than leaving the partnership with two keys and its data
 * split between them. The check constraint keeps the scope columns honest, so
 * a vault always belongs to exactly the one thing its kind says.
 */
export const vaults = sqliteTable(
	'vaults',
	{
		id: text('id').primaryKey(),
		kind: text('kind').$type<VaultKind>().notNull(),
		ownerUserId: text('owner_user_id')
			.unique()
			.references(() => user.id, { onDelete: 'cascade' }),
		partnershipId: text('partnership_id')
			.unique()
			.references(() => partnerships.id, { onDelete: 'cascade' }),
		/** The space this is the key of. `owner_user_id`/`partnership_id` say the same, and stay. */
		spaceId: spaceColumn(),
		/** HKDF of the key, base64url. Public; see `VAULT_KEY_CHECK_INFO`. */
		keyCheck: text('key_check').notNull(),
		...timestamps
	},
	(table) => [
		index('vaults_space_id_idx').on(table.spaceId),
		check(
			'vaults_scope_matches_kind',
			sql`(${table.kind} = 'self' AND ${table.ownerUserId} IS NOT NULL AND ${table.partnershipId} IS NULL) OR (${table.kind} = 'partnership' AND ${table.partnershipId} IS NOT NULL AND ${table.ownerUserId} IS NULL)`
		)
	]
);

/**
 * A vault's key, age-encrypted to one member's recipient.
 *
 * One per member *per recipient*. Ordinarily that is one per member; the second
 * exists during a partner-assisted sign-in, when the helping partner wraps the
 * vault for the key the member is about to have while the wrap for the key
 * they have now stays in place — so a sign-in that is declined or expires
 * leaves nothing lost. Completing the sign-in deletes the wraps for the old
 * key. A device only ever reads the wrap made for the recipient it holds.
 */
export const vaultWraps = sqliteTable(
	'vault_wraps',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** age, to `for_recipient`, standard base64. See `VaultWrapPayload`. */
		ciphertext: text('ciphertext').notNull(),
		forRecipient: text('for_recipient').notNull(),
		...timestamps
	},
	(table) => [
		uniqueIndex('vault_wraps_vault_user_recipient_idx').on(
			table.vaultId,
			table.userId,
			table.forRecipient
		),
		// Every read is "the wraps this user holds", once per page load.
		index('vault_wraps_user_id_idx').on(table.userId)
	]
);

/**
 * One self-contained exchange between the two people in a partnership.
 *
 * Not a chat log: the feature is many small threads, so `partnership_id` is
 * indexed together with `last_message_at` and every board read is one range
 * scan over this table plus a left join on `thread_reads`. `messages` is never
 * touched to render the board — that is what the two denormalised columns are
 * for.
 */
export const messageThreads = sqliteTable(
	'message_threads',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		partnershipId: text('partnership_id')
			.notNull()
			.references(() => partnerships.id, { onDelete: 'cascade' }),
		spaceId: spaceColumn(),
		/**
		 * The sticker this thread shows on the board. PLAINTEXT, and re-validated
		 * against `THREAD_ICONS` at every write path.
		 *
		 * The one unencrypted piece of user-chosen content in the feature, and the
		 * reason is that the board is the screen you look at to *decide* what to
		 * open — it has to render before any key is unlocked. What that leaks is
		 * about four bits from a fixed list of sixteen, next to timestamps, sender
		 * ids, read receipts and exact ciphertext byte sizes the server cannot
		 * avoid knowing anyway.
		 *
		 * The closed list is the load-bearing part. A free-text plaintext column
		 * here would be a covert channel for arbitrary prose, which is why
		 * `isThreadIcon` is checked in `server/messaging.ts` as well as in the
		 * endpoint's Zod schema — see AGENTS.md invariant 14.
		 */
		icon: text('icon').$type<ThreadIcon>().notNull(),
		/**
		 * Denormalised from `messages`, written in the same `db.batch()` as the
		 * insert.
		 *
		 * Two columns rather than one, because "unread" is per-viewer:
		 * `last_message_at` on its own would mark a thread unread for whoever had
		 * just posted in it. `sendMessage()` is the only writer of both, and it
		 * also upserts the sender's own `thread_reads` row in the same batch —
		 * which is what makes "the newest message is mine" a sound proxy for "I
		 * have read this thread", enforced on the server rather than by the UI.
		 *
		 * The rejected alternative was a pair of columns keyed on the permanent
		 * inviter/invitee roles, as the partnership's sealed names are. It works,
		 * but it puts role resolution inside SQL, and invariant 12 exists
		 * precisely because that mapping must live in exactly one place.
		 */
		lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }).notNull(),
		lastMessageSenderId: text('last_message_sender_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		...timestamps
	},
	(table) => [
		// The board's hot path: where partnership_id = ? order by last_message_at.
		index('message_threads_partnership_last_message_idx').on(
			table.partnershipId,
			table.lastMessageAt
		),
		// Today's per-partner unread counts filter on the sender before the join.
		index('message_threads_partnership_sender_idx').on(
			table.partnershipId,
			table.lastMessageSenderId
		),
		// Every space-scoped table is indexed on its space, for `deleteSpace`.
		index('message_threads_space_id_idx').on(table.spaceId)
	]
);

/** A reusable, partnership-scoped label for message threads. */
export const messageTags = sqliteTable(
	'message_tags',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		partnershipId: text('partnership_id')
			.notNull()
			.references(() => partnerships.id, { onDelete: 'cascade' }),
		spaceId: spaceColumn(),
		color: text('color').notNull(),
		/**
		 * The name, sealed in the partnership's vault (kind `tag`), and its
		 * blind index: a keyed hash of the normalised name that only says two
		 * tags in this partnership are called the same. What the unique index
		 * below enforces, since the name itself is unreadable here.
		 */
		...sealedContent(),
		nameIndex: text('name_index'),
		...timestamps
	},
	(table) => [
		uniqueIndex('message_tags_partnership_name_index_unq').on(table.partnershipId, table.nameIndex),
		index('message_tags_partnership_idx').on(table.partnershipId),
		index('message_tags_space_id_idx').on(table.spaceId)
	]
);

/** Many-to-many assignment so a thread can carry several reusable tags. */
export const messageThreadTags = sqliteTable(
	'message_thread_tags',
	{
		threadId: text('thread_id')
			.notNull()
			.references(() => messageThreads.id, { onDelete: 'cascade' }),
		tagId: text('tag_id')
			.notNull()
			.references(() => messageTags.id, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('message_thread_tags_thread_tag_unq').on(table.threadId, table.tagId),
		index('message_thread_tags_tag_idx').on(table.tagId)
	]
);

export type MessageTag = typeof messageTags.$inferSelect;
export type NewMessageTag = typeof messageTags.$inferInsert;

/**
 * One message. `ciphertext` is base64 of an age-encrypted body, and the server
 * learns nothing from it — not even the plaintext's length, beyond a bound.
 *
 * base64 `text` rather than `blob`, for three reasons in order of weight:
 * SvelteKit serialises load data with devalue, which cannot carry a
 * `Uint8Array`, so a blob column would need base64 at the boundary anyway;
 * `text` round-trips identically through libsql (dev and tests) and D1
 * (production), which a blob does not; and the 33% overhead applies only to
 * bodies, since attachments are raw bytes in R2 where it would have mattered.
 *
 * D1's per-value ceiling is 2,000,000 bytes. `MAX_CIPHERTEXT_BYTES` caps this
 * at 64 KB, well below it. Note the statement-length limit (100,000 bytes) is
 * not a concern only because drizzle sends this as a bound parameter rather
 * than inlining it — a hand-rolled `wrangler d1 execute` would hit it.
 */
export const messages = sqliteTable(
	'messages',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		threadId: text('thread_id')
			.notNull()
			.references(() => messageThreads.id, { onDelete: 'cascade' }),
		senderId: text('sender_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		ciphertext: text('ciphertext').notNull(),
		/**
		 * An encrypted sidecar for derived message metadata, such as cached embed
		 * details resolved from URLs in the body.
		 *
		 * Kept separate from `ciphertext` so the app can add or backfill derived
		 * data without rewriting the author-written body itself. Encrypted for the
		 * same reason as the body: a cached title or thumbnail URL is still message
		 * content derived from plaintext the server must not store in the clear.
		 */
		metadataCiphertext: text('metadata_ciphertext'),
		/**
		 * The partnership vault the body and its sidecar are sealed under.
		 *
		 * Nullable only because rows from before vaults had none, and making it
		 * NOT NULL now means rebuilding the table, which on D1 cascade-deletes
		 * every row that references it (see the trap in AGENTS.md). None is NULL
		 * any more and every writer sets it; the code holds the line.
		 */
		vaultId: text('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
		/** The sealed body's payload version. Nullable for the reason `vault_id` is. */
		payloadVersion: integer('payload_version'),
		/** The sealed sidecar's payload version, when there is a sealed sidecar. */
		metadataVersion: integer('metadata_version'),
		...timestamps
	},
	(table) => [
		// The thread view: where thread_id = ? order by created_at, id. `id` is in
		// the index so the tiebreak is covered too — two messages can share a
		// millisecond, and ordering by a UUID alone is never meaningful (invariant 8).
		index('messages_thread_created_idx').on(table.threadId, table.createdAt, table.id)
	]
);

/**
 * An encrypted image or video living in R2 — or, under `vite dev`, in a local
 * directory. See `src/lib/server/media/`.
 *
 * NO filename and NO mime type, deliberately: both live inside the encrypted
 * body, so the server learns only that a file exists and how many bytes it is.
 *
 * Each file is encrypted under its own ephemeral age identity, and that
 * identity travels inside the message body rather than the file being encrypted
 * to the two partners directly. That is what makes partner-assisted recovery
 * affordable: restoring someone's history re-encrypts message *bodies*, a few
 * kilobytes each, and never touches the 25 MB objects in R2.
 */
export const messageAttachments = sqliteTable(
	'message_attachments',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		messageId: text('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		/** Ciphertext size, which is what the 25 MB cap is enforced against. */
		byteSize: integer('byte_size').notNull(),
		/**
		 * The object key, written before the DB rows and never derived from them
		 * at read time.
		 *
		 * The layout is `<expiring|permanent>/<partnershipId>/<messageId>/<id>`
		 * (see `MEDIA_LIFETIMES`), so the bucket's lifecycle rule can match the
		 * self-destructing half and disconnecting can delete whole prefixes, but
		 * storing the key means that layout can change without a migration.
		 *
		 * Nothing cascades from D1 into R2. Deleting a partnership removes these
		 * rows, so the disconnect action purges the partnership's prefixes itself.
		 */
		storageKey: text('storage_key').notNull(),
		/**
		 * When the object stops being served and becomes eligible for the sweep.
		 * Null is permanent, which only the `permanentMedia` feature can ask for.
		 *
		 * Set by the server from the send time and the chosen lifetime, never by
		 * the client, whose clock the server has no reason to trust. Checked on
		 * every read, so expiry is exact even though the sweep that deletes the
		 * object only runs every quarter hour — see `src/lib/server/media/expiry.ts`.
		 */
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
		/**
		 * When the sweep deleted the object. The row outlives the object on
		 * purpose: it is a few bytes, and it is what lets the thread say the media
		 * self-destructed rather than that it is missing.
		 */
		purgedAt: integer('purged_at', { mode: 'timestamp_ms' }),
		...timestamps
	},
	(table) => [
		index('message_attachments_message_id_idx').on(table.messageId),
		// The sweep's query: unpurged rows whose expiry has passed.
		index('message_attachments_expiry_idx').on(table.purgedAt, table.expiresAt)
	]
);

/**
 * A tapback. One per user per message, replaced rather than appended.
 *
 * Encrypted, unlike the thread icon, and the contrast is deliberate: a reaction
 * only ever renders inside a thread that is already unlocked, so encrypting it
 * costs nothing at all. Keeping both decisions in view is what makes either
 * defensible.
 *
 * "You may only react to messages you received" is enforced in `setReaction()`,
 * not here: a SQLite CHECK constraint cannot see another table's `sender_id`.
 */
export const messageReactions = sqliteTable(
	'message_reactions',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		messageId: text('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		ciphertext: text('ciphertext').notNull(),
		/** As on `messages`: the vault it is sealed under, nullable only for history. */
		vaultId: text('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version'),
		...timestamps
	},
	(table) => [
		// The uniqueness IS the rule ("one reaction per user per message"), and it
		// is what onConflictDoUpdate targets — so it is a constraint rather than a
		// convention enforced in application code.
		uniqueIndex('message_reactions_message_user_unq').on(table.messageId, table.userId)
	]
);

/**
 * Per-user read state for one thread.
 *
 * `created_at` from the timestamps helper IS "first opened" — a separate column
 * would be the same value written twice.
 *
 * `last_read_message_at` holds a timestamp rather than a message id, and is
 * compared against the thread's `last_message_at`, so a message that arrives
 * between the read being written and the next board render is correctly still
 * unread.
 */
export const threadReads = sqliteTable(
	'thread_reads',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		threadId: text('thread_id')
			.notNull()
			.references(() => messageThreads.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/**
		 * Drives the read half of the board order: when the thread most recently
		 * became fully read.
		 */
		lastFullyReadAt: integer('last_fully_read_at', { mode: 'timestamp_ms' }).notNull(),
		lastReadMessageAt: integer('last_read_message_at', { mode: 'timestamp_ms' }).notNull(),
		...timestamps
	},
	(table) => [
		uniqueIndex('thread_reads_thread_user_unq').on(table.threadId, table.userId),
		// The board's left join, and Today's aggregate, both look up (user, thread).
		index('thread_reads_user_thread_idx').on(table.userId, table.threadId)
	]
);

/**
 * Someone who has lost every way into their account, asking a partner to let
 * them back in.
 *
 * Created by an **unauthenticated** request from `/login/recover`, which is why
 * almost nothing here is in the clear:
 *
 * - `token_hash` — SHA-256 of a random token only the requester's browser holds.
 *   Everything the requester does afterwards is authorised by presenting it,
 *   and a stolen database cannot be used to complete a request.
 * - `email_hash` / `ip_hash` — keyed hashes, used only for rate limiting and for
 *   superseding a previous request. A row exists for an unknown email too
 *   (with `user_id` NULL), so that the endpoint behaves identically whether or
 *   not the account exists — see docs/account-recovery.md on the oracle this
 *   avoids. Keyed with the auth secret so a leaked table is not an email list.
 * - `recipient` / `wrap_*` — the requester's new public key and their new
 *   password wrap, both opaque. Note what is absent: the new `authSecret`
 *   arrives only at completion, so no login credential ever waits in here.
 * - `email_token_hash` — SHA-256 of a second random token, the one emailed to
 *   the account's address. Following that link sets `email_confirmed_at`.
 *   NULL for an unknown email, which is never sent anything.
 *
 * `status` moves pending → approved (a partner finished re-encrypting) →
 * completed (the requester signed in), or to declined / superseded. Completing
 * needs `email_confirmed_at` as well as `approved`: a partner alone cannot
 * sign in as someone else (docs/account-recovery.md). Expiry is
 * `expires_at`, read at use rather than written by a job.
 */
export const accountRecoveryRequests = sqliteTable(
	'account_recovery_requests',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		/** NULL when the email matched no account, which must look no different. */
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		emailHash: text('email_hash').notNull(),
		ipHash: text('ip_hash'),
		tokenHash: text('token_hash').notNull().unique(),
		recipient: text('recipient').notNull(),
		wrapParams: text('wrap_params', { mode: 'json' }).$type<KeyWrapParams>().notNull(),
		wrapBlob: text('wrap_blob').notNull(),
		status: text('status').$type<AccountRecoveryStatus>().notNull().default('pending'),
		/** The partner whose re-encryption approved it. */
		approvedBy: text('approved_by').references(() => user.id, { onDelete: 'set null' }),
		emailTokenHash: text('email_token_hash').unique(),
		/** When the link sent to the account's address was followed and confirmed. */
		emailConfirmedAt: integer('email_confirmed_at', { mode: 'timestamp_ms' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
		...timestamps
	},
	(table) => [
		index('account_recovery_requests_user_status_idx').on(table.userId, table.status),
		// Both rate limits count recent rows for one hash.
		index('account_recovery_requests_email_created_idx').on(table.emailHash, table.createdAt),
		index('account_recovery_requests_ip_created_idx').on(table.ipHash, table.createdAt)
	]
);

/**
 * A request for a partner to re-encrypt the shared history to a new key.
 *
 * Opened by a partner-assisted sign-in, one per partnership the requester is
 * in: whoever finishes re-encrypting first is what approves the sign-in, and
 * the others can do theirs afterwards. An identity is lost only when every way
 * in is lost, and then this is the only way back to the history: both people
 * can decrypt every message in the partnership, so the other one can
 * re-encrypt it — the server cannot help, and does not need to.
 *
 * `requestedRecipient` is a SNAPSHOT, and that is the security-relevant part.
 * The partner confirms against the recipient they compared out of band, and the
 * re-encryption targets exactly that string — not whatever `user_keys` happens
 * to say at upload time. Without the snapshot, a malicious server could swap
 * the recipient between the confirmation and the upload and have the partner
 * hand it the entire history.
 */
export const historyRestoreRequests = sqliteTable(
	'history_restore_requests',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		partnershipId: text('partnership_id')
			.notNull()
			.references(() => partnerships.id, { onDelete: 'cascade' }),
		spaceId: spaceColumn(),
		/** Who lost their key. The other member is the one who can act on it. */
		requesterId: text('requester_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		requestedRecipient: text('requested_recipient').notNull(),
		/** The sign-in this belongs to. Nullable only because older rows predate it. */
		recoveryRequestId: text('recovery_request_id').references(() => accountRecoveryRequests.id, {
			onDelete: 'cascade'
		}),
		status: text('status').$type<RestoreRequestStatus>().notNull().default('pending'),
		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
		...timestamps
	},
	(table) => [
		// The partner's board asks "is anyone waiting on me in this partnership?".
		index('history_restore_requests_partnership_status_idx').on(table.partnershipId, table.status),
		index('history_restore_requests_recovery_idx').on(table.recoveryRequestId),
		index('history_restore_requests_space_id_idx').on(table.spaceId)
	]
);

/**
 * A user's own vault key, held in escrow by one partner and the server
 * together. See docs/encryption.md, "Escrow".
 *
 * `ciphertext` is age, to the partner's recipient, of the vault key sealed
 * under a share only the server can produce (`escrowShare` in
 * `server/vaults.ts`, an HMAC of this row's id under the auth secret — so the
 * share is stored nowhere). The partner can open their layer but not the
 * share's; the server has the share but cannot open the partner's layer. It
 * takes both, and the server releases the share only to the account itself,
 * after a partner-assisted sign-in it confirmed by email.
 *
 * One per partnership the user has. The id is chosen by the browser, because
 * the share is derived from it before anything is sealed.
 */
export const vaultEscrows = sqliteTable(
	'vault_escrows',
	{
		id: text('id').primaryKey(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		partnershipId: text('partnership_id')
			.notNull()
			.references(() => partnerships.id, { onDelete: 'cascade' }),
		/**
		 * The shared space the escrow is held in — the partner's side of it —
		 * not the space of the vault it holds (that is the owner's solo space).
		 */
		spaceId: spaceColumn(),
		ciphertext: text('ciphertext').notNull(),
		...timestamps
	},
	(table) => [
		uniqueIndex('vault_escrows_vault_partnership_idx').on(table.vaultId, table.partnershipId),
		index('vault_escrows_space_id_idx').on(table.spaceId)
	]
);

/**
 * The partner's half of an escrow, passed on during a partner-assisted
 * sign-in: their layer opened, and the inside re-encrypted to the key the
 * sign-in gives the account. Still sealed under the server's share, so it
 * opens nothing until the server releases that too.
 */
export const vaultEscrowRelays = sqliteTable(
	'vault_escrow_relays',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		escrowId: text('escrow_id')
			.notNull()
			.references(() => vaultEscrows.id, { onDelete: 'cascade' }),
		recoveryRequestId: text('recovery_request_id')
			.notNull()
			.references(() => accountRecoveryRequests.id, { onDelete: 'cascade' }),
		ciphertext: text('ciphertext').notNull(),
		...timestamps
	},
	(table) => [
		uniqueIndex('vault_escrow_relays_escrow_request_idx').on(
			table.escrowId,
			table.recoveryRequestId
		)
	]
);

export type VaultEscrow = typeof vaultEscrows.$inferSelect;
export type VaultEscrowRelay = typeof vaultEscrowRelays.$inferSelect;

export type UserKeys = typeof userKeys.$inferSelect;
export type NewUserKeys = typeof userKeys.$inferInsert;
export type UserKeyWrap = typeof userKeyWraps.$inferSelect;
export type NewUserKeyWrap = typeof userKeyWraps.$inferInsert;
export type Vault = typeof vaults.$inferSelect;
export type NewVault = typeof vaults.$inferInsert;
export type VaultWrap = typeof vaultWraps.$inferSelect;
export type NewVaultWrap = typeof vaultWraps.$inferInsert;
export type MessageThread = typeof messageThreads.$inferSelect;
export type NewMessageThread = typeof messageThreads.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type NewMessageAttachment = typeof messageAttachments.$inferInsert;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;
export type ThreadRead = typeof threadReads.$inferSelect;
export type NewThreadRead = typeof threadReads.$inferInsert;
export type AccountRecoveryRequest = typeof accountRecoveryRequests.$inferSelect;
export type NewAccountRecoveryRequest = typeof accountRecoveryRequests.$inferInsert;
export type HistoryRestoreRequest = typeof historyRestoreRequests.$inferSelect;
export type NewHistoryRestoreRequest = typeof historyRestoreRequests.$inferInsert;

/**
 * The features an account holds. No row, no feature — see
 * docs/features-and-admin.md.
 *
 * One row per (user, feature), which is also the shape a purchase will need:
 * buying a feature will insert the same row with `source = 'purchase'`, so the
 * access check never has to learn where access came from. Revoking deletes the
 * row rather than flagging it, so "holds it" is simply "a row exists".
 *
 * `feature` is a plain string in the database. A key later removed from
 * `FEATURES` can leave rows behind, which `listUserFeatures` filters out rather
 * than trusting the `$type`.
 */
export const userFeatures = sqliteTable(
	'user_features',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		feature: text('feature').$type<FeatureKey>().notNull(),
		source: text('source').$type<FeatureSource>().notNull(),
		/**
		 * The admin who granted it, for the audit trail. Null for a purchase, and
		 * after that admin's account is deleted — the grant outlives them.
		 */
		grantedByUserId: text('granted_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(table) => [
		// Makes a repeated grant a no-op, and doubles as the index for the only
		// read path: "this user's features".
		uniqueIndex('user_features_user_feature_idx').on(table.userId, table.feature)
	]
);

export type UserFeature = typeof userFeatures.$inferSelect;
export type NewUserFeature = typeof userFeatures.$inferInsert;

/**
 * Counters for the sign-in and sign-up rate limit (`server/rate-limit.ts`).
 *
 * In the database rather than in memory because on Workers every isolate would
 * otherwise keep counts of its own, and a guesser spread across them would
 * never meet the limit. One row per rule and client address, rewritten in
 * place by a single upsert, so a burst of concurrent attempts cannot all read
 * a count below the limit.
 *
 * The key is an HMAC of the rule and the address, keyed with the auth secret,
 * for the reason `account_recovery_requests.ip_hash` is: an address is
 * guessable, so a plain hash of one would be reversible. Rows are pruned by the
 * media sweep once their window has closed.
 */
export const authRateLimits = sqliteTable(
	'auth_rate_limits',
	{
		key: text('key').primaryKey(),
		count: integer('count').notNull(),
		windowEnd: integer('window_end', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('auth_rate_limits_window_end_idx').on(table.windowEnd)]
);

export type AuthRateLimit = typeof authRateLimits.$inferSelect;

/**
 * One device that has agreed to receive push notifications.
 *
 * A row per browser subscription rather than per user, because preferences are
 * per device too: someone may want reactions on their phone but not their
 * laptop. See docs/notifications.md.
 *
 * `endpoint` is the push service URL the browser handed out, and it is a
 * capability — anyone holding it, with the keys beside it, can make that device
 * show a notification. It is never put in load data; a screen names a device by
 * `id` and `label`.
 *
 * `p256dh` and `auth` are the subscription's public key and auth secret, which
 * RFC 8291 encrypts each payload to. Neither opens anything of the user's: the
 * push service only ever sees ciphertext, and the payload never contains a byte
 * of message content anyway.
 */
export const pushSubscriptions = sqliteTable(
	'push_subscriptions',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		/** A rough device name from the user agent, so settings can list them. */
		label: text('label').notNull(),
		notifyMessages: integer('notify_messages', { mode: 'boolean' }).notNull().default(true),
		notifyReactions: integer('notify_reactions', { mode: 'boolean' }).notNull().default(true),
		/** When a push service last accepted a message for this device. */
		lastSuccessAt: integer('last_success_at', { mode: 'timestamp_ms' }),
		...timestamps
	},
	(table) => [
		// A browser re-subscribing hands back the same endpoint, and the upsert in
		// `savePushSubscription` keys on it so that is an update, not a duplicate
		// that would show every notification twice.
		uniqueIndex('push_subscriptions_endpoint_unq').on(table.endpoint),
		// The send path: "every device of this user".
		index('push_subscriptions_user_idx').on(table.userId)
	]
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;

/**
 * One finished sitting of the Playroom's IQ test, kept for its taker's history.
 *
 * Plaintext like tasks and rewards: a score and the settings it was taken
 * under, which is what the history shows. The score is reported by the
 * browser, which ran the test; nothing re-marks it, because nothing depends on
 * it being honest. `seed` is kept for the record, though it no longer deals
 * a run again on its own: past the first round, which questions came up
 * depended on the answers, and those are not stored.
 * See docs/playroom.md.
 */
export const iqTestResults = sqliteTable(
	'iq_test_results',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').$type<Role>().notNull(),
		/** The slider's level, 0–4: a number, so levels compare. */
		intensity: integer('intensity').$type<Intensity>().notNull(),
		/** Null for a clinical run, which has no vibe whatever was picked. */
		vibe: text('vibe').$type<Vibe>(),
		iq: integer('iq').notNull(),
		correct: integer('correct').notNull(),
		attempted: integer('attempted').notNull(),
		/** Of those attempted, how many were skipped. The results tease about them. */
		skipped: integer('skipped').notNull().default(0),
		/**
		 * The two settings the results screen depends on, as they were in
		 * effect: whether it humiliated, and whether it wore the vibe's look.
		 * The rest only shaped the run itself.
		 */
		humiliating: integer('humiliating', { mode: 'boolean' }).notNull().default(true),
		themedLook: integer('themed_look', { mode: 'boolean' }).notNull().default(true),
		soberIq: integer('sober_iq'),
		targetIq: integer('target_iq'),
		seed: integer('seed').notNull(),
		...timestamps
	},
	(table) => [
		// The history list and Today's card: "this user's, newest first".
		index('iq_test_results_owner_created_idx').on(table.ownerId, table.createdAt)
	]
);

export type IqTestResult = typeof iqTestResults.$inferSelect;
export type NewIqTestResult = typeof iqTestResults.$inferInsert;

/**
 * A daydream: a roleplay with a made-up character, set up by its owner and
 * written turn by turn with a language model. See docs/daydreams.md.
 *
 * Everything the user wrote is sealed in their own vault, and these columns
 * are NOT NULL, unlike `sealedContent()`'s: there were never plaintext
 * daydreams to carry. The id is chosen by the browser, because it is part of
 * what the setup is sealed to.
 */
export const daydreams = sqliteTable(
	'daydreams',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** The owner's solo space, for now; see docs/spaces.md. */
		spaceId: spaceColumn(),
		/** The setup: title, character, scenario, limits. */
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		/** Bumped by every write, so an edit is compare-and-swap. */
		revision: integer('revision').notNull().default(0),
		/** What the list sorts by: the newest conversation first. Null before the opening. */
		lastTurnAt: integer('last_turn_at', { mode: 'timestamp_ms' }),
		/**
		 * The turn the user is on: the end of the branch the page shows. Set by
		 * every append, and by moving between branches. Null before the opening.
		 *
		 * No foreign key, for the reason `daydreamTurns.parentId` has none; the
		 * server checks it names one of this daydream's turns before storing it.
		 */
		activeTurnId: text('active_turn_id'),
		...timestamps
	},
	(table) => [
		// The list and Today's card: "this user's, most recently played first".
		index('daydreams_owner_last_turn_idx').on(table.ownerId, table.lastTurnAt),
		index('daydreams_space_id_idx').on(table.spaceId)
	]
);

/**
 * One turn of a daydream: something the user did, or a passage of the story.
 *
 * Turns form a tree, so one daydream can hold every branch of its story:
 * retrying a reply, rewriting a passage or carrying on from an earlier point
 * adds a sibling rather than replacing anything. A turn is never changed once
 * written — which is also what keeps a bookmarked quote's offsets true.
 *
 * `role` (who wrote it) is the one plaintext fact about a turn's content;
 * what kind of turn it is lives in the sealed payload. `parentId` and
 * `position` are the tree's shape, which the server needs to hand back the
 * branch being read.
 */
export const daydreamTurns = sqliteTable(
	'daydream_turns',
	{
		id: text('id').primaryKey(),
		daydreamId: text('daydream_id')
			.notNull()
			.references(() => daydreams.id, { onDelete: 'cascade' }),
		/**
		 * The turn this one follows; null for a root (the opening, or a retried
		 * opening).
		 *
		 * No foreign key: added to a live table, where `ALTER TABLE … ADD COLUMN
		 * … REFERENCES` cannot carry an `ON DELETE` (AGENTS.md, "Traps") and the
		 * rebuild that could would empty the table on D1. Nothing is lost by it:
		 * turns are only ever deleted with their daydream, whose cascade takes
		 * every one at once. `appendTurn` checks the parent is in the same
		 * daydream.
		 */
		parentId: text('parent_id'),
		role: text('role').$type<DaydreamTurnRole>().notNull(),
		/**
		 * How deep in its branch the turn is: 0 for a root, its parent's plus one
		 * otherwise. Named for what it was when the story was a single line,
		 * where position and depth were the same number; a rename is a column
		 * rebuild drizzle-kit only offers interactively, for no gain.
		 */
		position: integer('position').notNull(),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		/** Always 0 now that turns are never changed; left from when a retry replaced one. */
		revision: integer('revision').notNull().default(0),
		...timestamps
	},
	(table) => [
		// "This turn's children": the branch map, and a parent check on append.
		index('daydream_turns_daydream_parent_idx').on(table.daydreamId, table.parentId)
	]
);

/**
 * A mark on a turn: a bookmark (a save point, or a highlighted quote) or a
 * reaction. Sealed, like the turn it marks; the server knows only which turn.
 */
export const daydreamMarks = sqliteTable(
	'daydream_marks',
	{
		id: text('id').primaryKey(),
		daydreamId: text('daydream_id')
			.notNull()
			.references(() => daydreams.id, { onDelete: 'cascade' }),
		// A new table, so the cascade is real here, unlike `parentId`'s.
		turnId: text('turn_id')
			.notNull()
			.references(() => daydreamTurns.id, { onDelete: 'cascade' }),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		revision: integer('revision').notNull().default(0),
		...timestamps
	},
	(table) => [index('daydream_marks_daydream_idx').on(table.daydreamId)]
);

/**
 * One request a daydream made to the model and its answer, exactly as they
 * went, sealed and compressed (`daydream-exchange`), for debug mode's raw log
 * (docs/debug-mode.md). Kept apart from the turn it wrote so the story loads
 * without it, and only for an account granted debug mode.
 *
 * `turnId` is the passage it wrote; null for a request that wrote none (the
 * reply failed), which `parentTurnId` places under the turn it answered.
 * Both cascade: a new table, so unlike `daydreamTurns.parentId` the action
 * is real.
 */
export const daydreamExchanges = sqliteTable(
	'daydream_exchanges',
	{
		id: text('id').primaryKey(),
		daydreamId: text('daydream_id')
			.notNull()
			.references(() => daydreams.id, { onDelete: 'cascade' }),
		turnId: text('turn_id').references(() => daydreamTurns.id, { onDelete: 'cascade' }),
		/** What it answered: the turn before it, or null for an opening. */
		parentTurnId: text('parent_turn_id').references(() => daydreamTurns.id, {
			onDelete: 'cascade'
		}),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		...timestamps
	},
	(table) => [
		// The raw log's "these turns' exchanges", and the failed ones under them.
		index('daydream_exchanges_daydream_turn_idx').on(table.daydreamId, table.turnId),
		index('daydream_exchanges_daydream_parent_idx').on(table.daydreamId, table.parentTurnId)
	]
);

/**
 * A suggestion request that wrote a daydream's draft, and its answer, sealed
 * and compressed (`daydream-setup-exchange`), for debug mode's raw log
 * (docs/debug-mode.md, "Setup exchanges"). Sent with the create, and kept
 * only for an account granted debug mode.
 *
 * A table of its own rather than rows in `daydream_exchanges` with no turn:
 * there, a row that names no turn is a failed opening.
 */
export const daydreamSetupExchanges = sqliteTable(
	'daydream_setup_exchanges',
	{
		id: text('id').primaryKey(),
		daydreamId: text('daydream_id')
			.notNull()
			.references(() => daydreams.id, { onDelete: 'cascade' }),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		...timestamps
	},
	(table) => [index('daydream_setup_exchanges_daydream_idx').on(table.daydreamId)]
);

/**
 * A character in the user's library, to pick for any daydream. Picking one
 * copies it into the daydream's setup, with the revision it was copied at, so
 * an edit here never changes a story under way; the setup page notices the
 * revision has moved on and offers the newer version.
 */
export const daydreamCharacters = sqliteTable(
	'daydream_characters',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		spaceId: spaceColumn(),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		revision: integer('revision').notNull().default(0),
		...timestamps
	},
	(table) => [
		index('daydream_characters_owner_updated_idx').on(table.ownerId, table.updatedAt),
		index('daydream_characters_space_id_idx').on(table.spaceId)
	]
);

/**
 * An idea in the user's library. Copied into a daydream exactly as a
 * character is. The table keeps the name ideas shipped under, "scenes":
 * renaming it buys nothing but a migration (docs/daydreams.md, "Ideas").
 */
export const daydreamIdeas = sqliteTable(
	'daydream_scenes',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		spaceId: spaceColumn(),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		revision: integer('revision').notNull().default(0),
		...timestamps
	},
	(table) => [
		index('daydream_scenes_owner_updated_idx').on(table.ownerId, table.updatedAt),
		index('daydream_scenes_space_id_idx').on(table.spaceId)
	]
);

/**
 * A user's Daydreams settings. For now only whether they have been told, and
 * accepted, that what they write in a daydream goes to a model provider.
 *
 * A table of its own rather than a column on `user`, whose schema file is
 * generated (`schema/auth.ts`).
 */
export const daydreamPreferences = sqliteTable('daydream_preferences', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	disclosureAcceptedAt: integer('disclosure_accepted_at', { mode: 'timestamp_ms' }),
	...timestamps
});

/**
 * How long Runware takes to make a picture, as a weighted moving average per
 * workload: everything that decides the time (`PictureWorkload` in
 * `daydream/image-prompt.ts`), and nothing about who asked or what of. The
 * picture's progress ring is drawn against it. See docs/daydreams.md,
 * "Pictures".
 *
 * An average rather than a history of runs: one row per workload is all the
 * estimate needs, and nothing grows with use. A workload no longer made just
 * stops being updated; a handful of rows is not worth sweeping.
 */
export const daydreamPictureTimings = sqliteTable(
	'daydream_picture_timings',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		model: text('model').notNull(),
		/** 0 for Runware's default, which the request leaves to it. */
		steps: integer('steps').notNull(),
		/** 0 for Runware's default, as `steps`. */
		cfgScale: real('cfg_scale').notNull(),
		width: integer('width').notNull(),
		height: integer('height').notNull(),
		averageMs: real('average_ms').notNull(),
		/** How many runs the average is over, which sets how much the next one moves it. */
		samples: integer('samples').notNull(),
		...timestamps
	},
	(table) => [
		uniqueIndex('daydream_picture_timings_workload_idx').on(
			table.model,
			table.steps,
			table.cfgScale,
			table.width,
			table.height
		)
	]
);

export type Daydream = typeof daydreams.$inferSelect;
export type NewDaydream = typeof daydreams.$inferInsert;
export type DaydreamTurn = typeof daydreamTurns.$inferSelect;
export type NewDaydreamTurn = typeof daydreamTurns.$inferInsert;
export type DaydreamPreferences = typeof daydreamPreferences.$inferSelect;
export type DaydreamPictureTiming = typeof daydreamPictureTimings.$inferSelect;
export type NewDaydreamPictureTiming = typeof daydreamPictureTimings.$inferInsert;
export type NewDaydreamPreferences = typeof daydreamPreferences.$inferInsert;
export type DaydreamMark = typeof daydreamMarks.$inferSelect;
export type NewDaydreamMark = typeof daydreamMarks.$inferInsert;
export type DaydreamExchange = typeof daydreamExchanges.$inferSelect;
export type NewDaydreamExchange = typeof daydreamExchanges.$inferInsert;
export type DaydreamCharacterRow = typeof daydreamCharacters.$inferSelect;
export type NewDaydreamCharacterRow = typeof daydreamCharacters.$inferInsert;
export type DaydreamIdeaRow = typeof daydreamIdeas.$inferSelect;
export type NewDaydreamIdeaRow = typeof daydreamIdeas.$inferInsert;

/**
 * A kink list: one sealed record per person per scope. `scope` is `'self'` for
 * a person's own list and the partnership's id for the copy they share with
 * that partner (docs/kink-list.md, "Partners").
 *
 * The whole list is one ciphertext rather than a row per kink, so the server
 * cannot tell which kinks were answered. What it can see is when the list
 * last changed, which is all version history needs (`edited_at`).
 *
 * The id is chosen by the browser, because the ciphertext is bound to it.
 */
export const kinkLists = sqliteTable(
	'kink_lists',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		scope: text('scope').notNull(),
		/** Set exactly when `scope` is a partnership, so unlinking takes the shared copies with it. */
		partnershipId: text('partnership_id').references(() => partnerships.id, {
			onDelete: 'cascade'
		}),
		/** The owner's solo space for their own list; the partnership's for a shared copy. */
		spaceId: spaceColumn(),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		revision: integer('revision').notNull().default(0),
		editedAt: integer('edited_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
		...timestamps
	},
	(table) => [
		uniqueIndex('kink_lists_owner_scope_idx').on(table.ownerId, table.scope),
		// A partner reads the other member's shared copy by partnership.
		index('kink_lists_partnership_idx').on(table.partnershipId),
		index('kink_lists_space_id_idx').on(table.spaceId)
	]
);

export type KinkListRow = typeof kinkLists.$inferSelect;
export type NewKinkListRow = typeof kinkLists.$inferInsert;

/**
 * Your own kink list as it stood at the end of a burst of edits. A version is
 * kept once a week has gone by without changes: the next save copies the
 * list as it was, before applying itself (`saveKinkList`). It is sealed to
 * the list's id, which is the record id it was sealed with, so it opens
 * exactly like the list did. See docs/kink-list.md, "Version history".
 */
export const kinkListVersions = sqliteTable(
	'kink_list_versions',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		listId: text('list_id')
			.notNull()
			.references(() => kinkLists.id, { onDelete: 'cascade' }),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		ciphertext: text('ciphertext').notNull(),
		payloadVersion: integer('payload_version').notNull(),
		/** When the burst of edits this version ends began: the previous version's end, or the list's creation. */
		editedFrom: integer('edited_from', { mode: 'timestamp_ms' }).notNull(),
		/** The last edit in the burst. */
		editedTo: integer('edited_to', { mode: 'timestamp_ms' }).notNull(),
		frozenAt: integer('frozen_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('kink_list_versions_list_idx').on(table.listId, table.editedTo)]
);

export type KinkListVersionRow = typeof kinkListVersions.$inferSelect;

/**
 * A notebook entry: a journal entry (dated) or a note, belonging to one
 * account (`owner_id`) or one partnership (`partnership_id`), never both.
 * See docs/notebook.md.
 *
 * **Nothing here is content.** The document itself is the entry's edits
 * (`notebook_updates`) and versions (`notebook_versions`), every one sealed in
 * the browser. The `ciphertext` on this row is the `notebook-entry` header
 * (title and list excerpt), a cache a device rewrites as the document changes,
 * sealed like everything else, from its first byte. The id comes from the browser, because
 * the header is sealed to it.
 *
 * `partner_access` and `access_set_by_user_id` restrict a partnership entry
 * for the member who did not set them; the rules are `entryAccessFor` in
 * `src/lib/notebook.ts`, and the server enforces them on every read and
 * write. `last_edited_*` are written at most once a minute per entry, because
 * every batch of typing is a request and D1 bills for rows written.
 */
export const notebookEntries = sqliteTable(
	'notebook_entries',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id').references(() => user.id, { onDelete: 'cascade' }),
		partnershipId: text('partnership_id').references(() => partnerships.id, {
			onDelete: 'cascade'
		}),
		/** Says what `owner_id`/`partnership_id` say, which stay along with their CHECK. */
		spaceId: spaceColumn(),
		kind: text('kind').$type<NotebookKind>().notNull(),
		/** `YYYY-MM-DD`, for a journal entry; null for a note. */
		entryDate: text('entry_date'),
		createdByUserId: text('created_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		partnerAccess: text('partner_access').$type<PartnerAccess>().notNull().default('edit'),
		accessSetByUserId: text('access_set_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		lastEditedAt: integer('last_edited_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
		lastEditedByUserId: text('last_edited_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		revision: integer('revision').notNull().default(0),
		...timestamps
	},
	(table) => [
		check(
			'notebook_entries_one_scope',
			sql`(${table.ownerId} IS NOT NULL AND ${table.partnershipId} IS NULL) OR (${table.ownerId} IS NULL AND ${table.partnershipId} IS NOT NULL)`
		),
		index('notebook_entries_owner_date_idx').on(table.ownerId, table.kind, table.entryDate),
		index('notebook_entries_partnership_date_idx').on(
			table.partnershipId,
			table.kind,
			table.entryDate
		),
		index('notebook_entries_owner_edited_idx').on(table.ownerId, table.lastEditedAt),
		index('notebook_entries_partnership_edited_idx').on(table.partnershipId, table.lastEditedAt),
		index('notebook_entries_space_id_idx').on(table.spaceId)
	]
);

export type NotebookEntryRow = typeof notebookEntries.$inferSelect;
export type NewNotebookEntryRow = typeof notebookEntries.$inferInsert;

/**
 * One batch of edits to an entry, sealed: a Yjs update. Opening an entry is
 * its latest version plus every update after it.
 *
 * `seq` is the order the server stored them in, and the only order it
 * guarantees. Yjs merges updates in any order, so `seq` is not about
 * correctness: it is how a device asks for "everything after what I have"
 * after a reconnect, and how a version says what it covers. The id is the
 * browser's, because the update is sealed to it, and unique, so a batch
 * resent after a lost response is stored once.
 *
 * Deleted once two versions cover them; see `compactionBound` in
 * `src/lib/notebook.ts`.
 */
export const notebookUpdates = sqliteTable(
	'notebook_updates',
	{
		seq: integer('seq').primaryKey({ autoIncrement: true }),
		id: text('id').notNull().unique(),
		entryId: text('entry_id')
			.notNull()
			.references(() => notebookEntries.id, { onDelete: 'cascade' }),
		authorUserId: text('author_user_id').references(() => user.id, { onDelete: 'set null' }),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		ciphertext: text('ciphertext').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
	},
	(table) => [index('notebook_updates_entry_seq_idx').on(table.entryId, table.seq)]
);

export type NotebookUpdateRow = typeof notebookUpdates.$inferSelect;

/**
 * An automatic version of an entry: the whole document as it stood once a
 * sitting of edits ended. The snapshot itself is sealed and kept in the media
 * store (R2, or the media directory), because a long entry outgrows a
 * comfortable D1 row; this row is what the history lists. Its key is derived
 * from the entry's scope and the two ids, `notebookSnapshotKey`.
 *
 * `up_to_seq` is the last edit the snapshot includes, unique per entry so two
 * devices cutting the same version store it once. The contributors are
 * the authors of the edits it covers, which the server knows anyway because
 * it saw who posted each one.
 */
export const notebookVersions = sqliteTable(
	'notebook_versions',
	{
		id: text('id').primaryKey(),
		entryId: text('entry_id')
			.notNull()
			.references(() => notebookEntries.id, { onDelete: 'cascade' }),
		upToSeq: integer('up_to_seq').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		/** Characters of sealed snapshot in the media store, for the cap and for debugging. */
		size: integer('size').notNull(),
		contributorUserIds: text('contributor_user_ids', { mode: 'json' }).$type<string[]>().notNull(),
		/** Set when this version was cut by restoring an earlier one. Not a reference: that one may since be gone. */
		restoredFromVersionId: text('restored_from_version_id'),
		createdByUserId: text('created_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
	},
	(table) => [
		uniqueIndex('notebook_versions_entry_seq_idx').on(table.entryId, table.upToSeq),
		index('notebook_versions_entry_created_idx').on(table.entryId, table.createdAt)
	]
);

export type NotebookVersionRow = typeof notebookVersions.$inferSelect;

/**
 * One person's settings for the scene designer's prompt column, sealed in
 * their own vault (`scene-preferences`): how much of each type of prompt to
 * show, and which prompts they never want to see. Sealed rather than columns
 * because the prompts someone waves away say something about what they are
 * into. One row per person; compare-and-swap on `revision`, so two devices
 * saving at once merge rather than overwrite. See docs/scenes.md.
 */
export const scenePreferences = sqliteTable('scene_preferences', {
	/** The sealed record's id, bound into its ciphertext. */
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	ciphertext: text('ciphertext').notNull(),
	vaultId: text('vault_id')
		.notNull()
		.references(() => vaults.id, { onDelete: 'cascade' }),
	payloadVersion: integer('payload_version').notNull(),
	revision: integer('revision').notNull().default(0),
	...timestamps
});

export type ScenePreferencesRow = typeof scenePreferences.$inferSelect;

/**
 * That a person has read where a scene's text goes when they ask the model
 * for help with it, and agreed. The server refuses to send anything to the
 * model until there is a row: the one point where a scene's words leave
 * Bound Up readable, so the agreeing is the server's to check, as the
 * daydreams' disclosure is. See docs/scenes.md, "Help from the model".
 */
export const sceneHelpConsents = sqliteTable('scene_help_consents', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
	...timestamps
});

/**
 * The server's own settings, edited from Admin → Server settings: its secrets,
 * how it sends email, and which model providers and models it uses. One row
 * per setting (`SERVER_SETTING_KEYS`), read through
 * `$lib/server/settings`. See docs/server-settings.md.
 *
 * A cleared setting is a row holding `''`, never a deleted row: a missing row
 * is what the one-time import from the environment fills, and it must not
 * bring back something an admin removed.
 */
export const serverSettings = sqliteTable('server_settings', {
	key: text('key').$type<ServerSettingKey>().primaryKey(),
	value: text('value').notNull(),
	source: text('source').$type<ServerSettingSource>().notNull(),
	...timestamps
});

export type ServerSettingRow = typeof serverSettings.$inferSelect;
export type NewServerSettingRow = typeof serverSettings.$inferInsert;

/**
 * One row per (model, provider endpoint, kind): what its adult-content check
 * found, the admin's override, and its health in use (docs/server-settings.md,
 * "Adult content by provider"). Server state, not user content, so nothing
 * here is sealed, and nothing of any story is ever stored: only the level a
 * provider passed and the kind and code of its last rejection.
 */
export const modelProviders = sqliteTable(
	'model_providers',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		/** The model as listed, without an `@` routing suffix. */
		model: text('model').notNull(),
		/** OpenRouter's endpoint tag, e.g. "deepinfra/fp4", which routing accepts. */
		provider: text('provider').notNull(),
		kind: text('kind').$type<ProviderKind>().notNull(),
		/** Cheapest first, as OpenRouter lists them: the tie-break in routing. */
		listOrder: integer('list_order').notNull().default(0),
		/** The highest adult level it passed; null when never checked. */
		levelPassed: integer('level_passed').$type<AdultLevel>(),
		checkedAt: integer('checked_at', { mode: 'timestamp_ms' }),
		override: text('override').$type<ProviderOverride>().notNull().default('auto'),
		refusalsInRow: integer('refusals_in_row').notNull().default(0),
		errorsInRow: integer('errors_in_row').notNull().default(0),
		successesInRow: integer('successes_in_row').notNull().default(0),
		refusalBackoffUntil: integer('refusal_backoff_until', { mode: 'timestamp_ms' }),
		errorBackoffUntil: integer('error_backoff_until', { mode: 'timestamp_ms' }),
		lastReason: text('last_reason'),
		...timestamps
	},
	(table) => [
		// Every lookup is "this model's providers of this kind", for routing and the admin page.
		uniqueIndex('model_providers_model_provider_kind_idx').on(
			table.model,
			table.provider,
			table.kind
		)
	]
);

export type ModelProviderRow = typeof modelProviders.$inferSelect;
export type NewModelProviderRow = typeof modelProviders.$inferInsert;

/**
 * A daydream of the new engine (docs/dreams.md, "Storage"). Independent of
 * `daydreams`, which the old engine keeps until the switch-over.
 *
 * Everything in it is sealed in the owner's own vault: the setup is one
 * record, saved after each finished step of setting it up. The id is chosen
 * by the browser, because it is part of what the setup is sealed to.
 */
export const dreams = sqliteTable(
	'dreams',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** The owner's solo space: daydreams are solo for now (docs/spaces.md). */
		spaceId: spaceColumn(),
		/** The setup (`dream-setup`): brief, reading, direction, build, preferences. */
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		/** Bumped by every write of the setup, so saving it is compare-and-swap. */
		revision: integer('revision').notNull().default(0),
		/** What the list sorts by. Null before the opening. */
		lastTurnAt: integer('last_turn_at', { mode: 'timestamp_ms' }),
		/**
		 * The turn the user is on: the end of the branch the page shows. The
		 * server checks it names one of this daydream's turns before storing it.
		 */
		activeTurnId: text('active_turn_id'),
		...timestamps
	},
	(table) => [
		index('dreams_owner_last_turn_idx').on(table.ownerId, table.lastTurnAt),
		index('dreams_space_id_idx').on(table.spaceId)
	]
);

/**
 * One turn of a daydream (`dream-turn`): a passage, or the user's turn.
 * Turns form a tree, so every version of a passage (a retry, another take,
 * an edit) is a sibling and nothing is thrown away. Never changed once
 * written. `role` and the tree's shape are the only plaintext.
 */
export const dreamTurns = sqliteTable(
	'dream_turns',
	{
		id: text('id').primaryKey(),
		dreamId: text('dream_id')
			.notNull()
			.references(() => dreams.id, { onDelete: 'cascade' }),
		/**
		 * The turn this one follows; null for an opening. No foreign key: turns
		 * are only deleted with their daydream, whose cascade takes them all, and
		 * `appendDreamTurn` checks the parent is in the same daydream.
		 */
		parentId: text('parent_id'),
		role: text('role').$type<'user' | 'model'>().notNull(),
		/** 0 for an opening, its parent's plus one otherwise. */
		depth: integer('depth').notNull(),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		...timestamps
	},
	(table) => [index('dream_turns_dream_parent_idx').on(table.dreamId, table.parentId)]
);

/**
 * Detail filled in on a turn (`dream-detail`): a card, facts added after a
 * passage, or an expanded `<more>`. What it is about (an element's id, a
 * marker's) is sealed, since ids are words from the story; the server knows
 * only the turn it belongs to.
 */
export const dreamDetails = sqliteTable(
	'dream_details',
	{
		id: text('id').primaryKey(),
		dreamId: text('dream_id')
			.notNull()
			.references(() => dreams.id, { onDelete: 'cascade' }),
		turnId: text('turn_id')
			.notNull()
			.references(() => dreamTurns.id, { onDelete: 'cascade' }),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		...timestamps
	},
	(table) => [index('dream_details_dream_turn_idx').on(table.dreamId, table.turnId)]
);

/** A scene's summary (`dream-summary`), stored against the scene's last turn. */
export const dreamSummaries = sqliteTable(
	'dream_summaries',
	{
		id: text('id').primaryKey(),
		dreamId: text('dream_id')
			.notNull()
			.references(() => dreams.id, { onDelete: 'cascade' }),
		turnId: text('turn_id')
			.notNull()
			.references(() => dreamTurns.id, { onDelete: 'cascade' }),
		ciphertext: text('ciphertext').notNull(),
		vaultId: text('vault_id')
			.notNull()
			.references(() => vaults.id, { onDelete: 'cascade' }),
		payloadVersion: integer('payload_version').notNull(),
		...timestamps
	},
	(table) => [index('dream_summaries_dream_turn_idx').on(table.dreamId, table.turnId)]
);

/** The user's own preferences for every daydream (`dream-preferences`), hard limits among them. */
export const dreamPreferences = sqliteTable('dream_preferences', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	ciphertext: text('ciphertext').notNull(),
	vaultId: text('vault_id')
		.notNull()
		.references(() => vaults.id, { onDelete: 'cascade' }),
	payloadVersion: integer('payload_version').notNull(),
	revision: integer('revision').notNull().default(0),
	...timestamps
});

/**
 * How much an account has had read aloud each day (docs/dreams.md, "Read
 * aloud"), in UTF-8 bytes of text sent, which is what the voice provider
 * bills by. Counted before each request, against `voiceDailyCap`. `day` is
 * the UTC date, `YYYY-MM-DD`; nothing here says what was read.
 */
export const dreamVoiceUsage = sqliteTable(
	'dream_voice_usage',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		day: text('day').notNull(),
		bytes: integer('bytes').notNull().default(0)
	},
	(table) => [uniqueIndex('dream_voice_usage_user_day_idx').on(table.userId, table.day)]
);
