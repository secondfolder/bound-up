DROP INDEX `vault_wraps_vault_user_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `vault_wraps_vault_user_recipient_idx` ON `vault_wraps` (`vault_id`,`user_id`,`for_recipient`);--> statement-breakpoint
ALTER TABLE `message_reactions` ADD `vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `message_reactions` ADD `payload_version` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `messages` ADD `payload_version` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `metadata_version` integer;