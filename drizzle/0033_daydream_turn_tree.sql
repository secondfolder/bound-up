CREATE TABLE `daydream_characters` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`vault_id` text NOT NULL,
	`payload_version` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `daydream_characters_owner_updated_idx` ON `daydream_characters` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `daydream_marks` (
	`id` text PRIMARY KEY NOT NULL,
	`daydream_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`vault_id` text NOT NULL,
	`payload_version` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`daydream_id`) REFERENCES `daydreams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `daydream_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `daydream_marks_daydream_idx` ON `daydream_marks` (`daydream_id`);--> statement-breakpoint
CREATE TABLE `daydream_scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`vault_id` text NOT NULL,
	`payload_version` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `daydream_scenes_owner_updated_idx` ON `daydream_scenes` (`owner_id`,`updated_at`);--> statement-breakpoint
DROP INDEX `daydream_turns_daydream_position_idx`;--> statement-breakpoint
ALTER TABLE `daydream_turns` ADD `parent_id` text;--> statement-breakpoint
CREATE INDEX `daydream_turns_daydream_parent_idx` ON `daydream_turns` (`daydream_id`,`parent_id`);--> statement-breakpoint
ALTER TABLE `daydreams` ADD `active_turn_id` text;