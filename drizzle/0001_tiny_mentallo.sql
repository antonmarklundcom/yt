CREATE TABLE `batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_batch_id` varchar(128) NOT NULL,
	`status` enum('in_progress','ended','collected','canceled') NOT NULL DEFAULT 'in_progress',
	`model` varchar(64) NOT NULL,
	`video_count` int NOT NULL DEFAULT 0,
	`estimated_usd` decimal(10,6) NOT NULL DEFAULT '0',
	`submitted_at` timestamp NOT NULL DEFAULT (now()),
	`collected_at` timestamp,
	CONSTRAINT `batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `batches_provider_id_idx` UNIQUE(`provider_batch_id`)
);
--> statement-breakpoint
CREATE INDEX `batches_status_idx` ON `batches` (`status`);