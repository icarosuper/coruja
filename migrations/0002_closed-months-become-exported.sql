-- A closed month was one whose sheet had been filled: it becomes an exported month.
UPDATE `months` SET `exported_at` = `closed_at`, `exported_by_dev_id` = `closed_by_dev_id` WHERE `status` = 'closed';
