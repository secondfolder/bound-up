CREATE TABLE `reward_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`user_id` text NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_balances_space_user_idx` ON `reward_balances` (`space_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `reward_balances_user_idx` ON `reward_balances` (`user_id`);--> statement-breakpoint
CREATE TABLE `reward_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`reward_id` text NOT NULL,
	`claimed_by_user_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reward_cost` integer NOT NULL,
	`snapshot_ciphertext` text NOT NULL,
	`snapshot_vault_id` text NOT NULL,
	`snapshot_version` integer NOT NULL,
	`snapshot_record_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claimed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reward_claims_space_created_idx` ON `reward_claims` (`space_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reward_claims_reward_idx` ON `reward_claims` (`reward_id`);--> statement-breakpoint
CREATE INDEX `reward_claims_claimed_by_idx` ON `reward_claims` (`claimed_by_user_id`);--> statement-breakpoint
CREATE INDEX `reward_claims_snapshot_vault_idx` ON `reward_claims` (`snapshot_vault_id`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`assignee_user_id` text,
	`cost` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`ciphertext` text NOT NULL,
	`vault_id` text NOT NULL,
	`payload_version` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rewards_space_active_idx` ON `rewards` (`space_id`,`active`);--> statement-breakpoint
CREATE INDEX `rewards_assignee_idx` ON `rewards` (`assignee_user_id`);--> statement-breakpoint
CREATE INDEX `rewards_creator_idx` ON `rewards` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `rewards_vault_idx` ON `rewards` (`vault_id`);--> statement-breakpoint
CREATE TABLE `task_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`task_id` text NOT NULL,
	`completed_by_user_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`credits_awarded` integer NOT NULL,
	`completion_message_index` integer,
	`snapshot_ciphertext` text NOT NULL,
	`snapshot_vault_id` text NOT NULL,
	`snapshot_version` integer NOT NULL,
	`snapshot_record_id` text NOT NULL,
	`previous_active` integer,
	`previous_next_eligible_at` integer,
	`previous_last_completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_completions_space_created_idx` ON `task_completions` (`space_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_completions_task_created_idx` ON `task_completions` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_completions_completed_by_idx` ON `task_completions` (`completed_by_user_id`);--> statement-breakpoint
CREATE INDEX `task_completions_snapshot_vault_idx` ON `task_completions` (`snapshot_vault_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`assignee_user_id` text,
	`timezone_owner_user_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`credits_awarded` integer DEFAULT 0 NOT NULL,
	`completion_message_count` integer DEFAULT 0 NOT NULL,
	`ciphertext` text NOT NULL,
	`vault_id` text NOT NULL,
	`payload_version` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`schedule` text NOT NULL,
	`last_completed_at` integer,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`next_eligible_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`timezone_owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_space_active_idx` ON `tasks` (`space_id`,`active`);--> statement-breakpoint
CREATE INDEX `tasks_space_next_eligible_idx` ON `tasks` (`space_id`,`next_eligible_at`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_idx` ON `tasks` (`assignee_user_id`);--> statement-breakpoint
CREATE INDEX `tasks_creator_idx` ON `tasks` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `tasks_timezone_owner_idx` ON `tasks` (`timezone_owner_user_id`);--> statement-breakpoint
CREATE INDEX `tasks_vault_idx` ON `tasks` (`vault_id`);