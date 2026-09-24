CREATE TABLE `account_recovery_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email_hash` text NOT NULL,
	`ip_hash` text,
	`token_hash` text NOT NULL,
	`recipient` text NOT NULL,
	`wrap_params` text NOT NULL,
	`wrap_blob` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` text,
	`expires_at` integer NOT NULL,
	`resolved_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_recovery_requests_token_hash_unique` ON `account_recovery_requests` (`token_hash`);--> statement-breakpoint
CREATE INDEX `account_recovery_requests_user_status_idx` ON `account_recovery_requests` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `account_recovery_requests_email_created_idx` ON `account_recovery_requests` (`email_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `account_recovery_requests_ip_created_idx` ON `account_recovery_requests` (`ip_hash`,`created_at`);--> statement-breakpoint
DROP TABLE `passkey_details`;--> statement-breakpoint
ALTER TABLE `history_restore_requests` ADD `recovery_request_id` text REFERENCES account_recovery_requests(id);--> statement-breakpoint
CREATE INDEX `history_restore_requests_recovery_idx` ON `history_restore_requests` (`recovery_request_id`);--> statement-breakpoint
ALTER TABLE `user_key_wraps` DROP COLUMN `last_used_at`;--> statement-breakpoint
ALTER TABLE `user_keys` DROP COLUMN `history_warning_ack_at`;