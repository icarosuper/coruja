PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_months` (
	`id` text PRIMARY KEY NOT NULL,
	`opened_at` integer NOT NULL,
	`exported_at` integer,
	`exported_by_dev_id` integer,
	FOREIGN KEY (`exported_by_dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_months`("id", "opened_at", "exported_at", "exported_by_dev_id") SELECT "id", "opened_at", "exported_at", "exported_by_dev_id" FROM `months`;--> statement-breakpoint
DROP TABLE `months`;--> statement-breakpoint
ALTER TABLE `__new_months` RENAME TO `months`;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;