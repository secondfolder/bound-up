CREATE TABLE `server_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
