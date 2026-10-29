CREATE TABLE `model_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`list_order` integer DEFAULT 0 NOT NULL,
	`level_passed` integer,
	`checked_at` integer,
	`override` text DEFAULT 'auto' NOT NULL,
	`refusals_in_row` integer DEFAULT 0 NOT NULL,
	`errors_in_row` integer DEFAULT 0 NOT NULL,
	`successes_in_row` integer DEFAULT 0 NOT NULL,
	`refusal_backoff_until` integer,
	`error_backoff_until` integer,
	`last_reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_providers_model_provider_kind_idx` ON `model_providers` (`model`,`provider`,`kind`);