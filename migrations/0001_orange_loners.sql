ALTER TABLE `months` ADD `exported_at` integer;--> statement-breakpoint
ALTER TABLE `months` ADD `exported_by_dev_id` integer REFERENCES devs(id);