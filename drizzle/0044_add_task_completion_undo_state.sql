ALTER TABLE `partnership_task_completions` ADD `previous_active` integer;--> statement-breakpoint
ALTER TABLE `partnership_task_completions` ADD `previous_next_eligible_at` integer;--> statement-breakpoint
ALTER TABLE `partnership_task_completions` ADD `previous_last_completed_at` integer;--> statement-breakpoint
ALTER TABLE `self_task_completions` ADD `previous_active` integer;--> statement-breakpoint
ALTER TABLE `self_task_completions` ADD `previous_next_eligible_at` integer;--> statement-breakpoint
ALTER TABLE `self_task_completions` ADD `previous_last_completed_at` integer;