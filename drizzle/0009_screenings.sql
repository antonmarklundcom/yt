CREATE TABLE `screenings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`video_id` int NOT NULL,
	`status` enum('ok','failed') NOT NULL DEFAULT 'ok',
	`score` smallint,
	`reason` varchar(512),
	`model` varchar(64) NOT NULL,
	`prompt_version` smallint NOT NULL DEFAULT 1,
	`error` varchar(1024),
	`raw_response` text,
	`input_tokens` int NOT NULL DEFAULT 0,
	`output_tokens` int NOT NULL DEFAULT 0,
	`cost_usd` decimal(10,6) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `screenings_id` PRIMARY KEY(`id`),
	CONSTRAINT `screenings_video_id_idx` UNIQUE(`video_id`)
);
--> statement-breakpoint
CREATE INDEX `screenings_score_idx` ON `screenings` (`score`);