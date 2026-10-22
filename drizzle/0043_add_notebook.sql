CREATE TABLE `notebook_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`partnership_id` text,
	`kind` text NOT NULL,
	`entry_date` text,
	`created_by_user_id` text,
	`partner_access` text DEFAULT 'edit' NOT NULL,
	`access_set_by_user_id` text,
	`last_edited_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_edited_by_user_id` text,
	`ciphertext` text NOT NULL,
	`vault_id` text NOT NULL,
	`payload_version` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`partnership_id`) REFERENCES `partnerships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`access_set_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`last_edited_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notebook_entries_one_scope" CHECK(("notebook_entries"."owner_id" IS NOT NULL AND "notebook_entries"."partnership_id" IS NULL) OR ("notebook_entries"."owner_id" IS NULL AND "notebook_entries"."partnership_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `notebook_entries_owner_date_idx` ON `notebook_entries` (`owner_id`,`kind`,`entry_date`);--> statement-breakpoint
CREATE INDEX `notebook_entries_partnership_date_idx` ON `notebook_entries` (`partnership_id`,`kind`,`entry_date`);--> statement-breakpoint
CREATE INDEX `notebook_entries_owner_edited_idx` ON `notebook_entries` (`owner_id`,`last_edited_at`);--> statement-breakpoint
CREATE INDEX `notebook_entries_partnership_edited_idx` ON `notebook_entries` (`partnership_id`,`last_edited_at`);--> statement-breakpoint
CREATE TABLE `notebook_updates` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`entry_id` text NOT NULL,
	`author_user_id` text,
	`vault_id` text NOT NULL,
	`payload_version` integer NOT NULL,
	`ciphertext` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `notebook_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notebook_updates_id_unique` ON `notebook_updates` (`id`);--> statement-breakpoint
CREATE INDEX `notebook_updates_entry_seq_idx` ON `notebook_updates` (`entry_id`,`seq`);--> statement-breakpoint
CREATE TABLE `notebook_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`up_to_seq` integer NOT NULL,
	`vault_id` text NOT NULL,
	`payload_version` integer NOT NULL,
	`size` integer NOT NULL,
	`contributor_user_ids` text NOT NULL,
	`restored_from_version_id` text,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `notebook_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notebook_versions_entry_seq_idx` ON `notebook_versions` (`entry_id`,`up_to_seq`);--> statement-breakpoint
CREATE INDEX `notebook_versions_entry_created_idx` ON `notebook_versions` (`entry_id`,`created_at`);