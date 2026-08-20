-- PR-24: rename the role enum's values, keeping existing rows.
--
-- drizzle-kit generates only the final MODIFY COLUMN. Run alone that is a data
-- loss bug: MySQL cannot map the existing 'admin'/'user' strings into an enum
-- that no longer contains them, so in strict mode the ALTER fails and in
-- non-strict mode every role silently becomes ''. The widen → remap → narrow
-- sequence below is the safe form, and is why this file is hand-written.
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','user','owner','employee') NOT NULL DEFAULT 'user';--> statement-breakpoint
UPDATE `users` SET `role` = 'owner' WHERE `role` = 'admin';--> statement-breakpoint
UPDATE `users` SET `role` = 'employee' WHERE `role` = 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('owner','employee') NOT NULL DEFAULT 'employee';
