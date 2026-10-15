ALTER TABLE `account_recovery_requests` ADD `email_token_hash` text;--> statement-breakpoint
ALTER TABLE `account_recovery_requests` ADD `email_confirmed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `account_recovery_requests_email_token_hash_unique` ON `account_recovery_requests` (`email_token_hash`);