ALTER TABLE `message_tags` ADD `ciphertext` text;--> statement-breakpoint
ALTER TABLE `message_tags` ADD `vault_id` text REFERENCES vaults(id);--> statement-breakpoint
ALTER TABLE `message_tags` ADD `payload_version` integer;--> statement-breakpoint
ALTER TABLE `message_tags` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `message_tags` ADD `name_index` text;--> statement-breakpoint
CREATE UNIQUE INDEX `message_tags_partnership_name_index_unq` ON `message_tags` (`partnership_id`,`name_index`);