-- Read-only. Confirm DATABASE() is the intended target and take a backup before applying.
SELECT DATABASE() AS selected_database;
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription'
AND COLUMN_NAME IN ('price_policy', 'frozen_plan_id', 'frozen_monthly_price_agorot', 'custom_monthly_price_agorot', 'custom_price_start_date', 'custom_price_end_date');
-- Expect zero rows before first apply; if columns exist, do not rerun ALTER blindly.
SELECT COUNT(*) AS subscribers, SUM(discount_percent IS NOT NULL OR discount_amount_agorot IS NOT NULL) AS legacy_discounts FROM subscription;
SELECT id, price_monthly_agorot, licensed_dealer_price_monthly_agorot, currency FROM subscription_plan
WHERE currency <> 'ILS' OR price_monthly_agorot > 100000000 OR licensed_dealer_price_monthly_agorot > 100000000;
