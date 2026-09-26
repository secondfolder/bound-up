ALTER TABLE `message_attachments` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `message_attachments` ADD `purged_at` integer;--> statement-breakpoint
CREATE INDEX `message_attachments_expiry_idx` ON `message_attachments` (`purged_at`,`expires_at`);