CREATE TABLE `space_members` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`user_id` text NOT NULL,
	`can_manage` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `space_members_space_user_idx` ON `space_members` (`space_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `space_members_user_id_idx` ON `space_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `daydream_characters` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `daydream_characters_space_id_idx` ON `daydream_characters` (`space_id`);--> statement-breakpoint
ALTER TABLE `daydream_scenes` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `daydream_scenes_space_id_idx` ON `daydream_scenes` (`space_id`);--> statement-breakpoint
ALTER TABLE `daydreams` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `daydreams_space_id_idx` ON `daydreams` (`space_id`);--> statement-breakpoint
ALTER TABLE `history_restore_requests` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `history_restore_requests_space_id_idx` ON `history_restore_requests` (`space_id`);--> statement-breakpoint
ALTER TABLE `kink_lists` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `kink_lists_space_id_idx` ON `kink_lists` (`space_id`);--> statement-breakpoint
ALTER TABLE `message_tags` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `message_tags_space_id_idx` ON `message_tags` (`space_id`);--> statement-breakpoint
ALTER TABLE `message_threads` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `message_threads_space_id_idx` ON `message_threads` (`space_id`);--> statement-breakpoint
ALTER TABLE `notebook_entries` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `notebook_entries_space_id_idx` ON `notebook_entries` (`space_id`);--> statement-breakpoint
ALTER TABLE `vault_escrows` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `vault_escrows_space_id_idx` ON `vault_escrows` (`space_id`);--> statement-breakpoint
ALTER TABLE `vaults` ADD `space_id` text REFERENCES spaces(id);--> statement-breakpoint
CREATE INDEX `vaults_space_id_idx` ON `vaults` (`space_id`);