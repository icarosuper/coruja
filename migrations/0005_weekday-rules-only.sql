PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_preference_rules` (
	`dev_id` integer NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`preference` text NOT NULL,
	PRIMARY KEY(`dev_id`, `kind`, `value`),
	FOREIGN KEY (`dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "preference_rules_value_in_range" CHECK("__new_preference_rules"."kind" = 'weekday' AND "__new_preference_rules"."value" BETWEEN 0 AND 6),
	CONSTRAINT "preference_rules_preference_valid" CHECK("__new_preference_rules"."preference" IN ('good', 'avoid', 'cant'))
);
--> statement-breakpoint
INSERT INTO `__new_preference_rules`("dev_id", "kind", "value", "preference") SELECT "dev_id", "kind", "value", "preference" FROM `preference_rules`;--> statement-breakpoint
DROP TABLE `preference_rules`;--> statement-breakpoint
ALTER TABLE `__new_preference_rules` RENAME TO `preference_rules`;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;