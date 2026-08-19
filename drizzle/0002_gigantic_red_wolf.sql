ALTER TABLE `outlines` ADD `status` enum('ok','failed') DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE `outlines` ADD `error` varchar(1024);