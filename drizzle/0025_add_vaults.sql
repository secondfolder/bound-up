CREATE TABLE `vault_wraps` (
	`id` text PRIMARY KEY NOT NULL,
	`vault_id` text NOT NULL,
	`user_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`for_recipient` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vault_wraps_vault_user_idx` ON `vault_wraps` (`vault_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `vault_wraps_user_id_idx` ON `vault_wraps` (`user_id`);--> statement-breakpoint
CREATE TABLE `vaults` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`owner_user_id` text,
	`partnership_id` text,
	`key_check` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "vaults_scope_matches_kind" CHECK(("vaults"."kind" = 'self' AND "vaults"."owner_user_id" IS NOT NULL AND "vaults"."partnership_id" IS NULL) OR ("vaults"."kind" = 'partnership' AND "vaults"."partnership_id" IS NOT NULL AND "vaults"."owner_user_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vaults_owner_user_id_unique` ON `vaults` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `vaults_partnership_id_unique` ON `vaults` (`partnership_id`);