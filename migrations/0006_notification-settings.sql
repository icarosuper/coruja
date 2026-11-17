CREATE TABLE `notification_settings` (
	`dev_id` integer PRIMARY KEY NOT NULL,
	`eve_enabled` integer DEFAULT true NOT NULL,
	`eve_time` text DEFAULT '18:00' NOT NULL,
	`day_enabled` integer DEFAULT false NOT NULL,
	`day_time` text DEFAULT '09:00' NOT NULL,
	`shift_start_enabled` integer DEFAULT false NOT NULL,
	`shift_changed_enabled` integer DEFAULT true NOT NULL,
	`month_opened_enabled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "notification_settings_eve_time_valid" CHECK("notification_settings"."eve_time" GLOB '[0-2][0-9]:[0-5][0-9]' AND "notification_settings"."eve_time" <= '23:59'),
	CONSTRAINT "notification_settings_day_time_valid" CHECK("notification_settings"."day_time" GLOB '[0-2][0-9]:[0-5][0-9]' AND "notification_settings"."day_time" <= '23:59')
);
--> statement-breakpoint
CREATE TABLE `sent_reminders` (
	`dev_id` integer NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`from_hour` integer NOT NULL,
	`sent_at` integer NOT NULL,
	PRIMARY KEY(`dev_id`, `date`, `kind`, `from_hour`),
	FOREIGN KEY (`dev_id`) REFERENCES `devs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sent_reminders_kind_valid" CHECK("sent_reminders"."kind" IN ('eve', 'day', 'shift_start'))
);
