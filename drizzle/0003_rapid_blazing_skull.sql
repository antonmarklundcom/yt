ALTER TABLE `videos` ADD `read_at` timestamp;--> statement-breakpoint
ALTER TABLE `videos` ADD `pinned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `videos_read_at_idx` ON `videos` (`read_at`);--> statement-breakpoint
CREATE INDEX `videos_pinned_idx` ON `videos` (`pinned`);--> statement-breakpoint
CREATE INDEX `videos_created_idx` ON `videos` (`created_at`);