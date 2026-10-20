CREATE TABLE `daydream_picture_timings` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`steps` integer NOT NULL,
	`cfg_scale` real NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`average_ms` real NOT NULL,
	`samples` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daydream_picture_timings_workload_idx` ON `daydream_picture_timings` (`model`,`steps`,`cfg_scale`,`width`,`height`);