CREATE TABLE `analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`video_id` int NOT NULL,
	`model` varchar(64) NOT NULL,
	`prompt_version` smallint NOT NULL DEFAULT 1,
	`status` enum('ok','failed') NOT NULL DEFAULT 'ok',
	`summary` text,
	`takeaways` json,
	`hook_breakdown` json,
	`timeline` json,
	`gaps` json,
	`ideas` json,
	`raw_response` longtext,
	`error` varchar(1024),
	`batch_id` varchar(128),
	`input_tokens` int NOT NULL DEFAULT 0,
	`output_tokens` int NOT NULL DEFAULT 0,
	`cache_read_tokens` int NOT NULL DEFAULT 0,
	`cache_write_tokens` int NOT NULL DEFAULT 0,
	`cost_usd` decimal(10,6) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outlines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analysis_id` int NOT NULL,
	`idea_index` smallint NOT NULL,
	`content` json,
	`raw_response` longtext,
	`model` varchar(64),
	`cost_usd` decimal(10,6) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outlines_id` PRIMARY KEY(`id`),
	CONSTRAINT `outlines_analysis_idea_idx` UNIQUE(`analysis_id`,`idea_index`)
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('channel','playlist') NOT NULL,
	`youtube_id` varchar(64) NOT NULL,
	`title` varchar(512) NOT NULL,
	`url` varchar(512) NOT NULL,
	`last_polled_at` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `sources_youtube_id_idx` UNIQUE(`youtube_id`)
);
--> statement-breakpoint
CREATE TABLE `spend_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` date NOT NULL,
	`cost_usd` decimal(10,6) NOT NULL DEFAULT '0',
	CONSTRAINT `spend_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `spend_log_day_idx` UNIQUE(`day`)
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	CONSTRAINT `topics_id` PRIMARY KEY(`id`),
	CONSTRAINT `topics_slug_idx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`video_id` int NOT NULL,
	`language` varchar(16),
	`source` enum('captions','manual','ai') NOT NULL DEFAULT 'captions',
	`word_count` int NOT NULL DEFAULT 0,
	`content` longtext NOT NULL,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transcripts_id` PRIMARY KEY(`id`),
	CONSTRAINT `transcripts_video_id_idx` UNIQUE(`video_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`role` enum('admin','user') NOT NULL DEFAULT 'user',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `video_topics` (
	`video_id` int NOT NULL,
	`topic_id` int NOT NULL,
	CONSTRAINT `video_topics_video_id_topic_id_pk` PRIMARY KEY(`video_id`,`topic_id`)
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`youtube_id` varchar(16) NOT NULL,
	`source_id` int,
	`title` varchar(512) NOT NULL,
	`channel_title` varchar(255),
	`published_at` timestamp,
	`duration_seconds` int,
	`view_count` bigint,
	`thumbnail_url` varchar(512),
	`caption_status` enum('unknown','available','none','failed') NOT NULL DEFAULT 'unknown',
	`caption_checked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `videos_id` PRIMARY KEY(`id`),
	CONSTRAINT `videos_youtube_id_idx` UNIQUE(`youtube_id`)
);
--> statement-breakpoint
CREATE INDEX `analyses_video_idx` ON `analyses` (`video_id`);--> statement-breakpoint
CREATE INDEX `analyses_status_idx` ON `analyses` (`status`);--> statement-breakpoint
CREATE INDEX `analyses_batch_idx` ON `analyses` (`batch_id`);--> statement-breakpoint
CREATE INDEX `sources_active_polled_idx` ON `sources` (`active`,`last_polled_at`);--> statement-breakpoint
CREATE INDEX `video_topics_topic_idx` ON `video_topics` (`topic_id`);--> statement-breakpoint
CREATE INDEX `videos_source_idx` ON `videos` (`source_id`);--> statement-breakpoint
CREATE INDEX `videos_published_idx` ON `videos` (`published_at`);--> statement-breakpoint
CREATE INDEX `videos_caption_status_idx` ON `videos` (`caption_status`);