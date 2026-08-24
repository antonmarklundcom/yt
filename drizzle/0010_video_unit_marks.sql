CREATE TABLE `video_unit_marks` (
	`video_id` int NOT NULL,
	`user_id` int NOT NULL,
	`unit_type` enum('summary','takeaway','hook','timeline','gap','idea') NOT NULL,
	`unit_index` int NOT NULL,
	`unit_text` varchar(1024) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_unit_marks_video_id_user_id_unit_type_unit_index_pk` PRIMARY KEY(`video_id`,`user_id`,`unit_type`,`unit_index`)
);
--> statement-breakpoint
CREATE INDEX `video_unit_marks_user_created_idx` ON `video_unit_marks` (`user_id`,`created_at`);