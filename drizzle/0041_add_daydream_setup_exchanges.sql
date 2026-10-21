CREATE TABLE `daydream_setup_exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`daydream_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`vault_id` text NOT NULL,
	`payload_version` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`daydream_id`) REFERENCES `daydreams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `daydream_setup_exchanges_daydream_idx` ON `daydream_setup_exchanges` (`daydream_id`);