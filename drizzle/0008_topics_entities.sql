CREATE TABLE `entities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	CONSTRAINT `entities_id` PRIMARY KEY(`id`),
	CONSTRAINT `entities_slug_idx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `video_entities` (
	`video_id` int NOT NULL,
	`entity_id` int NOT NULL,
	CONSTRAINT `video_entities_video_id_entity_id_pk` PRIMARY KEY(`video_id`,`entity_id`)
);
--> statement-breakpoint
ALTER TABLE `analyses` ADD `topics` json;--> statement-breakpoint
ALTER TABLE `analyses` ADD `entities` json;--> statement-breakpoint
ALTER TABLE `analyses` ADD `content_type` varchar(64);--> statement-breakpoint
CREATE INDEX `video_entities_entity_idx` ON `video_entities` (`entity_id`);