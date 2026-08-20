-- PR-25: move read state off `videos` and into `video_reads`, per user.
--
-- Hand-edited. drizzle-kit generated the CREATE TABLE and the two DROP COLUMNs
-- and nothing in between, which is correct as a schema diff and wrong as a
-- migration: it would drop every existing read_at and pinned flag on the floor.
-- The backfill below is the missing middle, and it has to run before the drops.
--
-- Rows go to the owner(s): before this migration the columns were global, and
-- the person who read those videos is whoever has been using the tool. If more
-- than one owner exists they each inherit the same state, which is what "shared
-- read state" meant anyway. Employees start clean — nothing recorded who read
-- what, so pretending otherwise would invent data.
CREATE TABLE `video_reads` (
	`video_id` int NOT NULL,
	`user_id` int NOT NULL,
	`read_at` timestamp,
	`pinned` boolean NOT NULL DEFAULT false,
	CONSTRAINT `video_reads_video_id_user_id_pk` PRIMARY KEY(`video_id`,`user_id`)
);
--> statement-breakpoint
CREATE INDEX `video_reads_user_read_idx` ON `video_reads` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `video_reads_user_pinned_idx` ON `video_reads` (`user_id`,`pinned`);--> statement-breakpoint
INSERT INTO `video_reads` (`video_id`, `user_id`, `read_at`, `pinned`)
SELECT `v`.`id`, `u`.`id`, `v`.`read_at`, `v`.`pinned`
FROM `videos` `v`
JOIN `users` `u` ON `u`.`role` = 'owner'
WHERE `v`.`read_at` IS NOT NULL OR `v`.`pinned` = 1;--> statement-breakpoint
DROP INDEX `videos_read_at_idx` ON `videos`;--> statement-breakpoint
DROP INDEX `videos_pinned_idx` ON `videos`;--> statement-breakpoint
ALTER TABLE `videos` DROP COLUMN `read_at`;--> statement-breakpoint
ALTER TABLE `videos` DROP COLUMN `pinned`;
