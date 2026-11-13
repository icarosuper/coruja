-- Day-of-month rules are gone (decisions #5): specific dates are absences now. Removed before the
-- next migration narrows the CHECK to weekday rules only.
DELETE FROM `preference_rules` WHERE `kind` = 'month_day';
