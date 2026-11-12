CREATE TABLE `absences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dev_id` integer NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`note` text,
	FOREIGN KEY (`dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "absences_range_valid" CHECK("absences"."from_date" <= "absences"."to_date")
);
--> statement-breakpoint
CREATE INDEX `absences_dev_id_idx` ON `absences` (`dev_id`);--> statement-breakpoint
CREATE TABLE `balance_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dev_id` integer NOT NULL,
	`month_id` text,
	`hours` real NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by_dev_id` integer,
	FOREIGN KEY (`dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`month_id`) REFERENCES `months`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "balance_adjustments_reason_valid" CHECK("balance_adjustments"."reason" IN ('joined', 'import'))
);
--> statement-breakpoint
CREATE INDEX `balance_adjustments_dev_id_idx` ON `balance_adjustments` (`dev_id`);--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month_id` text NOT NULL,
	`date` text,
	`actor_dev_id` integer,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`month_id`) REFERENCES `months`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `change_log_month_id_idx` ON `change_log` (`month_id`);--> statement-breakpoint
CREATE TABLE `confirmations` (
	`month_id` text NOT NULL,
	`dev_id` integer NOT NULL,
	`confirmed_at` integer NOT NULL,
	PRIMARY KEY(`month_id`, `dev_id`),
	FOREIGN KEY (`month_id`,`dev_id`) REFERENCES `month_participants`(`month_id`,`dev_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `days` (
	`date` text PRIMARY KEY NOT NULL,
	`month_id` text NOT NULL,
	`kind` text NOT NULL,
	`holiday_name` text,
	FOREIGN KEY (`month_id`) REFERENCES `months`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "days_kind_valid" CHECK("days"."kind" IN ('workday', 'day_off'))
);
--> statement-breakpoint
CREATE INDEX `days_month_id_idx` ON `days` (`month_id`);--> statement-breakpoint
CREATE TABLE `devs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nickname` text NOT NULL,
	`weight` integer DEFAULT 100 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`token_hash` text,
	`created_at` integer NOT NULL,
	`deactivated_at` integer,
	CONSTRAINT "devs_weight_not_negative" CHECK("devs"."weight" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devs_nickname_unique` ON `devs` (`nickname`);--> statement-breakpoint
CREATE UNIQUE INDEX `devs_token_hash_unique` ON `devs` (`token_hash`);--> statement-breakpoint
CREATE TABLE `month_participants` (
	`month_id` text NOT NULL,
	`dev_id` integer NOT NULL,
	`weight` integer NOT NULL,
	PRIMARY KEY(`month_id`, `dev_id`),
	FOREIGN KEY (`month_id`) REFERENCES `months`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "month_participants_weight_not_negative" CHECK("month_participants"."weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE `months` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`closed_by_dev_id` integer,
	FOREIGN KEY (`closed_by_dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "months_status_valid" CHECK("months"."status" IN ('open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE `preference_rules` (
	`dev_id` integer NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`preference` text NOT NULL,
	PRIMARY KEY(`dev_id`, `kind`, `value`),
	FOREIGN KEY (`dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "preference_rules_value_in_range" CHECK(("preference_rules"."kind" = 'weekday' AND "preference_rules"."value" BETWEEN 0 AND 6) OR ("preference_rules"."kind" = 'month_day' AND "preference_rules"."value" BETWEEN 1 AND 31)),
	CONSTRAINT "preference_rules_preference_valid" CHECK("preference_rules"."preference" IN ('good', 'avoid', 'cant'))
);
--> statement-breakpoint
CREATE TABLE `shift_segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`dev_id` integer NOT NULL,
	`from_hour` integer NOT NULL,
	`to_hour` integer NOT NULL,
	FOREIGN KEY (`date`) REFERENCES `days`(`date`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shift_segments_hours_valid" CHECK("shift_segments"."from_hour" >= 0 AND "shift_segments"."from_hour" < "shift_segments"."to_hour" AND "shift_segments"."to_hour" <= 24)
);
--> statement-breakpoint
CREATE INDEX `shift_segments_date_idx` ON `shift_segments` (`date`);--> statement-breakpoint
CREATE INDEX `shift_segments_dev_id_idx` ON `shift_segments` (`dev_id`);