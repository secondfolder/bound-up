CREATE TABLE `iq_test_results` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`role` text NOT NULL,
	`intensity` integer NOT NULL,
	`vibe` text,
	`iq` integer NOT NULL,
	`correct` integer NOT NULL,
	`attempted` integer NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`humiliating` integer DEFAULT true NOT NULL,
	`themed_look` integer DEFAULT true NOT NULL,
	`sober_iq` integer,
	`target_iq` integer,
	`seed` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `iq_test_results_owner_created_idx` ON `iq_test_results` (`owner_id`,`created_at`);