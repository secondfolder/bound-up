CREATE TABLE `kink_list_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`vault_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`payload_version` integer NOT NULL,
	`edited_from` integer NOT NULL,
	`edited_to` integer NOT NULL,
	`frozen_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `kink_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `kink_list_versions_list_idx` ON `kink_list_versions` (`list_id`,`edited_to`);