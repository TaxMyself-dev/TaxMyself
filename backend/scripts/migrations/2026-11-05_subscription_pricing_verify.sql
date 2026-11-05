SELECT DATABASE() AS selected_database;
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription'
AND COLUMN_NAME IN ('price_policy', 'frozen_plan_id', 'frozen_monthly_price_agorot', 'custom_monthly_price_agorot', 'custom_price_start_date', 'custom_price_end_date');
SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'subscription' AND CONSTRAINT_NAME IN ('ck_subscription_price_policy','ck_subscription_frozen_price','ck_subscription_custom_price','ck_subscription_custom_window');
SELECT price_policy, COUNT(*) AS subscribers FROM subscription GROUP BY price_policy;
SELECT COUNT(*) AS invalid_terms FROM subscription
WHERE price_policy NOT IN ('LIVE', 'FROZEN') OR custom_monthly_price_agorot < 0 OR custom_monthly_price_agorot > 100000000
OR (custom_price_start_date IS NOT NULL AND custom_price_end_date IS NOT NULL AND custom_price_start_date > custom_price_end_date);
