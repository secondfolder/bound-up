ALTER TABLE `partnership_reward_claims` ADD `snapshot_ciphertext` text;--> statement-breakpoint
ALTER TABLE `partnership_reward_claims` ADD `snapshot_vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `partnership_reward_claims` ADD `snapshot_version` integer;--> statement-breakpoint
ALTER TABLE `partnership_reward_claims` ADD `snapshot_record_id` text;--> statement-breakpoint
ALTER TABLE `partnership_rewards` ADD `ciphertext` text;--> statement-breakpoint
ALTER TABLE `partnership_rewards` ADD `vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `partnership_rewards` ADD `payload_version` integer;--> statement-breakpoint
ALTER TABLE `partnership_rewards` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `partnership_task_completions` ADD `completion_message_index` integer;--> statement-breakpoint
ALTER TABLE `partnership_task_completions` ADD `snapshot_ciphertext` text;--> statement-breakpoint
ALTER TABLE `partnership_task_completions` ADD `snapshot_vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `partnership_task_completions` ADD `snapshot_version` integer;--> statement-breakpoint
ALTER TABLE `partnership_task_completions` ADD `snapshot_record_id` text;--> statement-breakpoint
ALTER TABLE `partnership_tasks` ADD `completion_message_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `partnership_tasks` ADD `ciphertext` text;--> statement-breakpoint
ALTER TABLE `partnership_tasks` ADD `vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `partnership_tasks` ADD `payload_version` integer;--> statement-breakpoint
ALTER TABLE `partnership_tasks` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `self_reward_claims` ADD `snapshot_ciphertext` text;--> statement-breakpoint
ALTER TABLE `self_reward_claims` ADD `snapshot_vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `self_reward_claims` ADD `snapshot_version` integer;--> statement-breakpoint
ALTER TABLE `self_reward_claims` ADD `snapshot_record_id` text;--> statement-breakpoint
ALTER TABLE `self_rewards` ADD `ciphertext` text;--> statement-breakpoint
ALTER TABLE `self_rewards` ADD `vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `self_rewards` ADD `payload_version` integer;--> statement-breakpoint
ALTER TABLE `self_rewards` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `self_task_completions` ADD `completion_message_index` integer;--> statement-breakpoint
ALTER TABLE `self_task_completions` ADD `snapshot_ciphertext` text;--> statement-breakpoint
ALTER TABLE `self_task_completions` ADD `snapshot_vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `self_task_completions` ADD `snapshot_version` integer;--> statement-breakpoint
ALTER TABLE `self_task_completions` ADD `snapshot_record_id` text;--> statement-breakpoint
ALTER TABLE `self_tasks` ADD `completion_message_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `self_tasks` ADD `ciphertext` text;--> statement-breakpoint
ALTER TABLE `self_tasks` ADD `vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `self_tasks` ADD `payload_version` integer;--> statement-breakpoint
ALTER TABLE `self_tasks` ADD `revision` integer DEFAULT 0 NOT NULL;