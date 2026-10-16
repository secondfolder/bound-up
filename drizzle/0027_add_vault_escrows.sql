CREATE TABLE `vault_escrow_relays` (
	`id` text PRIMARY KEY NOT NULL,
	`escrow_id` text NOT NULL,
	`recovery_request_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`escrow_id`) REFERENCES `vault_escrows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recovery_request_id`) REFERENCES `account_recovery_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vault_escrow_relays_escrow_request_idx` ON `vault_escrow_relays` (`escrow_id`,`recovery_request_id`);--> statement-breakpoint
CREATE TABLE `vault_escrows` (
	`id` text PRIMARY KEY NOT NULL,
	`vault_id` text NOT NULL,
	`partnership_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vault_escrows_vault_partnership_idx` ON `vault_escrows` (`vault_id`,`partnership_id`);