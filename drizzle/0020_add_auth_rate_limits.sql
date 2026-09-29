CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_end` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_rate_limits_window_end_idx` ON `auth_rate_limits` (`window_end`);