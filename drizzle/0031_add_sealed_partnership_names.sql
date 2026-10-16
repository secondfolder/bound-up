ALTER TABLE `partnerships` ADD `names_ciphertext` text;--> statement-breakpoint
ALTER TABLE `partnerships` ADD `names_vault_id` text;--> statement-breakpoint
ALTER TABLE `partnerships` ADD `names_payload_version` integer;--> statement-breakpoint
ALTER TABLE `partnerships` ADD `names_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `partnerships` ADD `invite_ciphertext` text;--> statement-breakpoint
ALTER TABLE `partnerships` ADD `invite_payload_version` integer;--> statement-breakpoint
ALTER TABLE `partnerships` ADD `invite_key_wrap` text;