CREATE TABLE `daydream_exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`daydream_id` text NOT NULL,
	`turn_id` text,
	`parent_turn_id` text,
	`ciphertext` text NOT NULL,
	`vault_id` text NOT NULL,
	`payload_version` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`daydream_id`) REFERENCES `daydreams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `daydream_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_turn_id`) REFERENCES `daydream_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `daydream_exchanges_daydream_turn_idx` ON `daydream_exchanges` (`daydream_id`,`turn_id`);--> statement-breakpoint
CREATE INDEX `daydream_exchanges_daydream_parent_idx` ON `daydream_exchanges` (`daydream_id`,`parent_turn_id`);