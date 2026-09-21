CREATE TABLE `passkey_details` (
	`id` text PRIMARY KEY NOT NULL,
	`passkey_id` text NOT NULL,
	`user_id` text NOT NULL,
	`prf_status` text,
	`aaguid` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`passkey_id`) REFERENCES `passkey`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_details_passkey_id_unique` ON `passkey_details` (`passkey_id`);