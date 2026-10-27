-- Every task, reward, completion, claim and balance, copied from the tables
-- kept per scope (self_* and partnership_*) into the ones kept per space that
-- 0051 made. See docs/spaces.md and docs/tasks.md.
--
-- Custom (`drizzle-kit generate --custom`) because none of this is schema:
-- drizzle-kit can make the tables but cannot infer which rows belong in them.
-- Nothing here rebuilds or drops anything; 0053 drops the old tables once
-- this has run, children first.
--
-- Every row keeps its id. A task's or reward's sealed content is bound to
-- `kind|recordId|vaultId|version` (`sealedAad`), with kinds that never named
-- a scope (`task`, `reward`), so the same id and vault keep every ciphertext,
-- and every completion's and claim's copy of one, opening as it did.
--
-- A solo row's space is its owner's solo space; a partnership row's is the
-- partnership's shared space, which has the partnership's id (0049), so
-- `partnership_id` is copied as it is. Who completes or claims a row is now a
-- column, `assignee_user_id`: the owner for a solo row, and for a partnership
-- row the member who did not write it — nobody completes or claims what they
-- wrote. `assigneeFor` in src/lib/spaces.ts is the same rule.
--
-- Production held no unsealed task, reward, completion or claim when this was
-- written (checked 2026-10-27), which is why the new tables' sealed columns
-- are NOT NULL: a row without them would fail this copy loudly rather than
-- arrive unreadable.

INSERT INTO `tasks` (
	`id`, `space_id`, `created_by_user_id`, `assignee_user_id`, `timezone_owner_user_id`,
	`active`, `credits_awarded`, `completion_message_count`,
	`ciphertext`, `vault_id`, `payload_version`, `revision`,
	`schedule`, `last_completed_at`, `completed_count`, `next_eligible_at`,
	`created_at`, `updated_at`
)
SELECT
	t.`id`,
	(SELECT m.`space_id` FROM `space_members` m INNER JOIN `spaces` s ON s.`id` = m.`space_id`
		WHERE s.`kind` = 'solo' AND m.`user_id` = t.`owner_id`),
	t.`owner_id`, t.`owner_id`, t.`timezone_owner_user_id`,
	t.`active`, t.`credits_awarded`, t.`completion_message_count`,
	t.`ciphertext`, t.`vault_id`, t.`payload_version`, t.`revision`,
	t.`schedule`, t.`last_completed_at`, t.`completed_count`, t.`next_eligible_at`,
	t.`created_at`, t.`updated_at`
FROM `self_tasks` t;
--> statement-breakpoint
INSERT INTO `tasks` (
	`id`, `space_id`, `created_by_user_id`, `assignee_user_id`, `timezone_owner_user_id`,
	`active`, `credits_awarded`, `completion_message_count`,
	`ciphertext`, `vault_id`, `payload_version`, `revision`,
	`schedule`, `last_completed_at`, `completed_count`, `next_eligible_at`,
	`created_at`, `updated_at`
)
SELECT
	t.`id`, t.`partnership_id`, t.`created_by_user_id`,
	(SELECT m.`user_id` FROM `space_members` m
		WHERE m.`space_id` = t.`partnership_id` AND m.`user_id` <> t.`created_by_user_id`
		ORDER BY m.`created_at`, m.`id` LIMIT 1),
	t.`timezone_owner_user_id`,
	t.`active`, t.`credits_awarded`, t.`completion_message_count`,
	t.`ciphertext`, t.`vault_id`, t.`payload_version`, t.`revision`,
	t.`schedule`, t.`last_completed_at`, t.`completed_count`, t.`next_eligible_at`,
	t.`created_at`, t.`updated_at`
FROM `partnership_tasks` t;
--> statement-breakpoint
INSERT INTO `task_completions` (
	`id`, `space_id`, `task_id`, `completed_by_user_id`, `created_by_user_id`,
	`credits_awarded`, `completion_message_index`,
	`snapshot_ciphertext`, `snapshot_vault_id`, `snapshot_version`, `snapshot_record_id`,
	`previous_active`, `previous_next_eligible_at`, `previous_last_completed_at`,
	`created_at`, `updated_at`
)
SELECT
	c.`id`, t.`space_id`, c.`task_id`, c.`owner_id`, c.`owner_id`,
	c.`credits_awarded`, c.`completion_message_index`,
	c.`snapshot_ciphertext`, c.`snapshot_vault_id`, c.`snapshot_version`, c.`snapshot_record_id`,
	c.`previous_active`, c.`previous_next_eligible_at`, c.`previous_last_completed_at`,
	c.`created_at`, c.`updated_at`
FROM `self_task_completions` c INNER JOIN `tasks` t ON t.`id` = c.`task_id`;
--> statement-breakpoint
INSERT INTO `task_completions` (
	`id`, `space_id`, `task_id`, `completed_by_user_id`, `created_by_user_id`,
	`credits_awarded`, `completion_message_index`,
	`snapshot_ciphertext`, `snapshot_vault_id`, `snapshot_version`, `snapshot_record_id`,
	`previous_active`, `previous_next_eligible_at`, `previous_last_completed_at`,
	`created_at`, `updated_at`
)
SELECT
	c.`id`, c.`partnership_id`, c.`task_id`, c.`completed_by_user_id`, c.`created_by_user_id`,
	c.`credits_awarded`, c.`completion_message_index`,
	c.`snapshot_ciphertext`, c.`snapshot_vault_id`, c.`snapshot_version`, c.`snapshot_record_id`,
	c.`previous_active`, c.`previous_next_eligible_at`, c.`previous_last_completed_at`,
	c.`created_at`, c.`updated_at`
FROM `partnership_task_completions` c;
--> statement-breakpoint
INSERT INTO `rewards` (
	`id`, `space_id`, `created_by_user_id`, `assignee_user_id`, `cost`, `active`,
	`ciphertext`, `vault_id`, `payload_version`, `revision`, `created_at`, `updated_at`
)
SELECT
	r.`id`,
	(SELECT m.`space_id` FROM `space_members` m INNER JOIN `spaces` s ON s.`id` = m.`space_id`
		WHERE s.`kind` = 'solo' AND m.`user_id` = r.`owner_id`),
	r.`owner_id`, r.`owner_id`, r.`cost`, r.`active`,
	r.`ciphertext`, r.`vault_id`, r.`payload_version`, r.`revision`, r.`created_at`, r.`updated_at`
FROM `self_rewards` r;
--> statement-breakpoint
INSERT INTO `rewards` (
	`id`, `space_id`, `created_by_user_id`, `assignee_user_id`, `cost`, `active`,
	`ciphertext`, `vault_id`, `payload_version`, `revision`, `created_at`, `updated_at`
)
SELECT
	r.`id`, r.`partnership_id`, r.`created_by_user_id`,
	(SELECT m.`user_id` FROM `space_members` m
		WHERE m.`space_id` = r.`partnership_id` AND m.`user_id` <> r.`created_by_user_id`
		ORDER BY m.`created_at`, m.`id` LIMIT 1),
	r.`cost`, r.`active`,
	r.`ciphertext`, r.`vault_id`, r.`payload_version`, r.`revision`, r.`created_at`, r.`updated_at`
FROM `partnership_rewards` r;
--> statement-breakpoint
INSERT INTO `reward_claims` (
	`id`, `space_id`, `reward_id`, `claimed_by_user_id`, `created_by_user_id`, `reward_cost`,
	`snapshot_ciphertext`, `snapshot_vault_id`, `snapshot_version`, `snapshot_record_id`,
	`created_at`, `updated_at`
)
SELECT
	c.`id`, r.`space_id`, c.`reward_id`, c.`owner_id`, c.`owner_id`, c.`reward_cost`,
	c.`snapshot_ciphertext`, c.`snapshot_vault_id`, c.`snapshot_version`, c.`snapshot_record_id`,
	c.`created_at`, c.`updated_at`
FROM `self_reward_claims` c INNER JOIN `rewards` r ON r.`id` = c.`reward_id`;
--> statement-breakpoint
INSERT INTO `reward_claims` (
	`id`, `space_id`, `reward_id`, `claimed_by_user_id`, `created_by_user_id`, `reward_cost`,
	`snapshot_ciphertext`, `snapshot_vault_id`, `snapshot_version`, `snapshot_record_id`,
	`created_at`, `updated_at`
)
SELECT
	c.`id`, c.`partnership_id`, c.`reward_id`, c.`claimed_by_user_id`, c.`created_by_user_id`,
	c.`reward_cost`,
	c.`snapshot_ciphertext`, c.`snapshot_vault_id`, c.`snapshot_version`, c.`snapshot_record_id`,
	c.`created_at`, c.`updated_at`
FROM `partnership_reward_claims` c;
--> statement-breakpoint
INSERT INTO `reward_balances` (`id`, `space_id`, `user_id`, `credits`, `created_at`, `updated_at`)
SELECT
	b.`id`,
	(SELECT m.`space_id` FROM `space_members` m INNER JOIN `spaces` s ON s.`id` = m.`space_id`
		WHERE s.`kind` = 'solo' AND m.`user_id` = b.`owner_id`),
	b.`owner_id`, b.`credits`, b.`created_at`, b.`updated_at`
FROM `self_reward_credits` b;
--> statement-breakpoint
INSERT INTO `reward_balances` (`id`, `space_id`, `user_id`, `credits`, `created_at`, `updated_at`)
SELECT b.`id`, b.`partnership_id`, b.`user_id`, b.`credits`, b.`created_at`, b.`updated_at`
FROM `partnership_reward_credits` b;
