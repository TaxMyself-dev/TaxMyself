-- Run manually on the explicitly selected, backed-up database before starting this version.
-- Additive only: existing users default to LIVE; legacy discounts and stored debts are untouched.
ALTER TABLE subscription
  ADD COLUMN price_policy VARCHAR(10) NOT NULL DEFAULT 'LIVE',
  ADD COLUMN frozen_plan_id INT NULL DEFAULT NULL,
  ADD COLUMN frozen_monthly_price_agorot INT NULL DEFAULT NULL,
  ADD COLUMN custom_monthly_price_agorot INT NULL DEFAULT NULL,
  ADD COLUMN custom_price_start_date DATE NULL DEFAULT NULL,
  ADD COLUMN custom_price_end_date DATE NULL DEFAULT NULL,
  ADD CONSTRAINT ck_subscription_price_policy CHECK (price_policy IN ('LIVE', 'FROZEN')),
  ADD CONSTRAINT ck_subscription_frozen_price CHECK (frozen_monthly_price_agorot IS NULL OR frozen_monthly_price_agorot BETWEEN 0 AND 100000000),
  ADD CONSTRAINT ck_subscription_custom_price CHECK (custom_monthly_price_agorot IS NULL OR custom_monthly_price_agorot BETWEEN 0 AND 100000000),
  ADD CONSTRAINT ck_subscription_custom_window CHECK (custom_price_start_date IS NULL OR custom_price_end_date IS NULL OR custom_price_start_date <= custom_price_end_date);
