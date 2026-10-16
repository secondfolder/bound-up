PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_partnership_reward_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`partnership_id` text NOT NULL,
	`reward_id` text NOT NULL,
	`claimed_by_user_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reward_title` text,
	`reward_description` text,
	`reward_cost` integer NOT NULL,
	`snapshot_ciphertext` text,
	`snapshot_vault_id` text,
	`snapshot_version` integer,
	`snapshot_record_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reward_id`) REFERENCES `partnership_rewards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claimed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_partnership_reward_claims`("id", "partnership_id", "reward_id", "claimed_by_user_id", "created_by_user_id", "reward_title", "reward_description", "reward_cost", "snapshot_ciphertext", "snapshot_vault_id", "snapshot_version", "snapshot_record_id", "created_at", "updated_at") SELECT "id", "partnership_id", "reward_id", "claimed_by_user_id", "created_by_user_id", "reward_title", "reward_description", "reward_cost", "snapshot_ciphertext", "snapshot_vault_id", "snapshot_version", "snapshot_record_id", "created_at", "updated_at" FROM `partnership_reward_claims`;--> statement-breakpoint
DROP TABLE `partnership_reward_claims`;--> statement-breakpoint
ALTER TABLE `__new_partnership_reward_claims` RENAME TO `partnership_reward_claims`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `partnership_reward_claims_partnership_claimed_idx` ON `partnership_reward_claims` (`partnership_id`,`claimed_by_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `partnership_reward_claims_reward_idx` ON `partnership_reward_claims` (`reward_id`);--> statement-breakpoint
CREATE TABLE `__new_partnership_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`partnership_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`title` text,
	`description` text,
	`cost` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`ciphertext` text,
	`vault_id` text,
	`payload_version` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_partnership_rewards`("id", "partnership_id", "created_by_user_id", "title", "description", "cost", "active", "ciphertext", "vault_id", "payload_version", "revision", "created_at", "updated_at") SELECT "id", "partnership_id", "created_by_user_id", "title", "description", "cost", "active", "ciphertext", "vault_id", "payload_version", "revision", "created_at", "updated_at" FROM `partnership_rewards`;--> statement-breakpoint
DROP TABLE `partnership_rewards`;--> statement-breakpoint
ALTER TABLE `__new_partnership_rewards` RENAME TO `partnership_rewards`;--> statement-breakpoint
CREATE INDEX `partnership_rewards_partnership_active_idx` ON `partnership_rewards` (`partnership_id`,`active`);--> statement-breakpoint
CREATE INDEX `partnership_rewards_partnership_created_idx` ON `partnership_rewards` (`partnership_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `partnership_rewards_creator_idx` ON `partnership_rewards` (`created_by_user_id`);--> statement-breakpoint
CREATE TABLE `__new_partnership_task_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`partnership_id` text NOT NULL,
	`task_id` text NOT NULL,
	`completed_by_user_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`task_title` text,
	`task_description` text,
	`credits_awarded` integer NOT NULL,
	`completion_message` text,
	`completion_message_index` integer,
	`snapshot_ciphertext` text,
	`snapshot_vault_id` text,
	`snapshot_version` integer,
	`snapshot_record_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `partnership_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_partnership_task_completions`("id", "partnership_id", "task_id", "completed_by_user_id", "created_by_user_id", "task_title", "task_description", "credits_awarded", "completion_message", "completion_message_index", "snapshot_ciphertext", "snapshot_vault_id", "snapshot_version", "snapshot_record_id", "created_at", "updated_at") SELECT "id", "partnership_id", "task_id", "completed_by_user_id", "created_by_user_id", "task_title", "task_description", "credits_awarded", "completion_message", "completion_message_index", "snapshot_ciphertext", "snapshot_vault_id", "snapshot_version", "snapshot_record_id", "created_at", "updated_at" FROM `partnership_task_completions`;--> statement-breakpoint
DROP TABLE `partnership_task_completions`;--> statement-breakpoint
ALTER TABLE `__new_partnership_task_completions` RENAME TO `partnership_task_completions`;--> statement-breakpoint
CREATE INDEX `partnership_task_completions_partnership_completed_idx` ON `partnership_task_completions` (`partnership_id`,`completed_by_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `partnership_task_completions_task_idx` ON `partnership_task_completions` (`task_id`);--> statement-breakpoint
CREATE TABLE `__new_partnership_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`partnership_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`timezone_owner_user_id` text NOT NULL,
	`title` text,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`credits_awarded` integer DEFAULT 0 NOT NULL,
	`completion_messages` text,
	`completion_message_count` integer DEFAULT 0 NOT NULL,
	`ciphertext` text,
	`vault_id` text,
	`payload_version` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`schedule` text NOT NULL,
	`last_completed_at` integer,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`next_eligible_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`timezone_owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_partnership_tasks`("id", "partnership_id", "created_by_user_id", "timezone_owner_user_id", "title", "description", "active", "credits_awarded", "completion_messages", "completion_message_count", "ciphertext", "vault_id", "payload_version", "revision", "schedule", "last_completed_at", "completed_count", "next_eligible_at", "created_at", "updated_at") SELECT "id", "partnership_id", "created_by_user_id", "timezone_owner_user_id", "title", "description", "active", "credits_awarded", "completion_messages", "completion_message_count", "ciphertext", "vault_id", "payload_version", "revision", "schedule", "last_completed_at", "completed_count", "next_eligible_at", "created_at", "updated_at" FROM `partnership_tasks`;--> statement-breakpoint
DROP TABLE `partnership_tasks`;--> statement-breakpoint
ALTER TABLE `__new_partnership_tasks` RENAME TO `partnership_tasks`;--> statement-breakpoint
CREATE INDEX `partnership_tasks_partnership_active_idx` ON `partnership_tasks` (`partnership_id`,`active`);--> statement-breakpoint
CREATE INDEX `partnership_tasks_partnership_next_eligible_idx` ON `partnership_tasks` (`partnership_id`,`next_eligible_at`);--> statement-breakpoint
CREATE INDEX `partnership_tasks_creator_idx` ON `partnership_tasks` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `partnership_tasks_timezone_owner_idx` ON `partnership_tasks` (`timezone_owner_user_id`);--> statement-breakpoint
CREATE TABLE `__new_self_reward_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`reward_id` text NOT NULL,
	`reward_title` text,
	`reward_description` text,
	`reward_cost` integer NOT NULL,
	`snapshot_ciphertext` text,
	`snapshot_vault_id` text,
	`snapshot_version` integer,
	`snapshot_record_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reward_id`) REFERENCES `self_rewards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_self_reward_claims`("id", "owner_id", "reward_id", "reward_title", "reward_description", "reward_cost", "snapshot_ciphertext", "snapshot_vault_id", "snapshot_version", "snapshot_record_id", "created_at", "updated_at") SELECT "id", "owner_id", "reward_id", "reward_title", "reward_description", "reward_cost", "snapshot_ciphertext", "snapshot_vault_id", "snapshot_version", "snapshot_record_id", "created_at", "updated_at" FROM `self_reward_claims`;--> statement-breakpoint
DROP TABLE `self_reward_claims`;--> statement-breakpoint
ALTER TABLE `__new_self_reward_claims` RENAME TO `self_reward_claims`;--> statement-breakpoint
CREATE INDEX `self_reward_claims_owner_created_idx` ON `self_reward_claims` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `self_reward_claims_reward_idx` ON `self_reward_claims` (`reward_id`);--> statement-breakpoint
CREATE TABLE `__new_self_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text,
	`description` text,
	`cost` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`ciphertext` text,
	`vault_id` text,
	`payload_version` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_self_rewards`("id", "owner_id", "title", "description", "cost", "active", "ciphertext", "vault_id", "payload_version", "revision", "created_at", "updated_at") SELECT "id", "owner_id", "title", "description", "cost", "active", "ciphertext", "vault_id", "payload_version", "revision", "created_at", "updated_at" FROM `self_rewards`;--> statement-breakpoint
DROP TABLE `self_rewards`;--> statement-breakpoint
ALTER TABLE `__new_self_rewards` RENAME TO `self_rewards`;--> statement-breakpoint
CREATE INDEX `self_rewards_owner_active_idx` ON `self_rewards` (`owner_id`,`active`);--> statement-breakpoint
CREATE INDEX `self_rewards_owner_created_idx` ON `self_rewards` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_self_task_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`task_id` text NOT NULL,
	`task_title` text,
	`task_description` text,
	`credits_awarded` integer NOT NULL,
	`completion_message` text,
	`completion_message_index` integer,
	`snapshot_ciphertext` text,
	`snapshot_vault_id` text,
	`snapshot_version` integer,
	`snapshot_record_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `self_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_self_task_completions`("id", "owner_id", "task_id", "task_title", "task_description", "credits_awarded", "completion_message", "completion_message_index", "snapshot_ciphertext", "snapshot_vault_id", "snapshot_version", "snapshot_record_id", "created_at", "updated_at") SELECT "id", "owner_id", "task_id", "task_title", "task_description", "credits_awarded", "completion_message", "completion_message_index", "snapshot_ciphertext", "snapshot_vault_id", "snapshot_version", "snapshot_record_id", "created_at", "updated_at" FROM `self_task_completions`;--> statement-breakpoint
DROP TABLE `self_task_completions`;--> statement-breakpoint
ALTER TABLE `__new_self_task_completions` RENAME TO `self_task_completions`;--> statement-breakpoint
CREATE INDEX `self_task_completions_owner_created_idx` ON `self_task_completions` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `self_task_completions_task_idx` ON `self_task_completions` (`task_id`);--> statement-breakpoint
CREATE TABLE `__new_self_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`credits_awarded` integer DEFAULT 0 NOT NULL,
	`completion_messages` text,
	`completion_message_count` integer DEFAULT 0 NOT NULL,
	`ciphertext` text,
	`vault_id` text,
	`payload_version` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`schedule` text NOT NULL,
	`timezone_owner_user_id` text NOT NULL,
	`last_completed_at` integer,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`next_eligible_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`timezone_owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_self_tasks`("id", "owner_id", "title", "description", "active", "credits_awarded", "completion_messages", "completion_message_count", "ciphertext", "vault_id", "payload_version", "revision", "schedule", "timezone_owner_user_id", "last_completed_at", "completed_count", "next_eligible_at", "created_at", "updated_at") SELECT "id", "owner_id", "title", "description", "active", "credits_awarded", "completion_messages", "completion_message_count", "ciphertext", "vault_id", "payload_version", "revision", "schedule", "timezone_owner_user_id", "last_completed_at", "completed_count", "next_eligible_at", "created_at", "updated_at" FROM `self_tasks`;--> statement-breakpoint
DROP TABLE `self_tasks`;--> statement-breakpoint
ALTER TABLE `__new_self_tasks` RENAME TO `self_tasks`;--> statement-breakpoint
CREATE INDEX `self_tasks_owner_active_idx` ON `self_tasks` (`owner_id`,`active`);--> statement-breakpoint
CREATE INDEX `self_tasks_owner_next_eligible_idx` ON `self_tasks` (`owner_id`,`next_eligible_at`);--> statement-breakpoint
CREATE INDEX `self_tasks_timezone_owner_idx` ON `self_tasks` (`timezone_owner_user_id`);