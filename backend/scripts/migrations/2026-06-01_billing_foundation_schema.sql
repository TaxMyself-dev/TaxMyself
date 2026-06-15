-- ============================================================
-- Migration: billing_foundation_schema
-- Date: 2026-06-01
-- Scope: Full billing & subscription database foundation
--
-- Creates 14 new tables for the SaaS billing system:
--   subscription_plan, subscription, payment_method,
--   cardcom_checkout_session, cardcom_webhook_log, billing_event,
--   promotion, promotion_plan, coupon, coupon_plan,
--   coupon_redemption, subscription_discount,
--   subscription_cancellation, subscription_plan_change
--
-- Architecture decisions:
--   - All monetary values stored as INTEGER agorot (₪1 = 100 agorot)
--   - User identity via firebase_id (varchar) — no FK to user table
--   - No TypeORM migrations runner; dev uses synchronize:true
--   - This file is for production ALTER/CREATE only
--
-- `subscription` includes per-subscription discount fields
-- (discount_percent, discount_amount_agorot, discount_start_date,
-- discount_end_date) — added during Phase 1 of the billing
-- simplification effort, folded directly into this base schema since
-- the billing system has not yet gone live.
-- ============================================================

-- ------------------------------------------------------------
-- 1. subscription_plan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_plan` (
  `id`                     INT          NOT NULL AUTO_INCREMENT,
  `slug`                   VARCHAR(100) NOT NULL,
  `name`                   VARCHAR(255) NOT NULL,
  `description`            TEXT         NULL     DEFAULT NULL,
  `price_monthly_agorot`   INT          NOT NULL,
  `currency`               VARCHAR(3)   NOT NULL DEFAULT 'ILS',
  `modules`                TEXT         NULL     DEFAULT NULL COMMENT 'JSON array of ModuleName values',
  `trial_days`             INT          NOT NULL DEFAULT 14,
  `is_active`              TINYINT(1)   NOT NULL DEFAULT 1,
  `is_public`              TINYINT(1)   NOT NULL DEFAULT 1,
  `display_order`          INT          NOT NULL DEFAULT 0,
  `created_at`             DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`             DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at`             DATETIME(6)  NULL     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_subscription_plan_slug` (`slug`),
  KEY `ix_subscription_plan_listing` (`is_active`, `is_public`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. subscription
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription` (
  `id`                     INT          NOT NULL AUTO_INCREMENT,
  `firebase_id`            VARCHAR(255) NOT NULL,
  `plan_id`                INT          NULL     DEFAULT NULL COMMENT 'FK → subscription_plan.id',
  `payment_method_id`      INT          NULL     DEFAULT NULL COMMENT 'FK → payment_method.id',
  `status`                 ENUM('TRIAL','TRIAL_EXPIRED','ACTIVE','PAST_DUE','CANCELED')
                                        NOT NULL DEFAULT 'TRIAL',
  `trial_start`            DATETIME     NULL     DEFAULT NULL,
  `trial_end`              DATETIME     NULL     DEFAULT NULL,
  `current_period_start`   DATETIME     NULL     DEFAULT NULL,
  `current_period_end`     DATETIME     NULL     DEFAULT NULL,
  `next_billing_date`      DATETIME     NULL     DEFAULT NULL,
  `grace_period_ends_at`   DATETIME     NULL     DEFAULT NULL,
  `canceled_at`            DATETIME     NULL     DEFAULT NULL,
  `ended_at`               DATETIME     NULL     DEFAULT NULL,
  `discount_percent`       INT          NULL     DEFAULT NULL COMMENT 'Percentage discount 0-100, mutually exclusive with discount_amount_agorot',
  `discount_amount_agorot` INT          NULL     DEFAULT NULL COMMENT 'Fixed discount in agorot, mutually exclusive with discount_percent',
  `discount_start_date`    DATE         NULL     DEFAULT NULL,
  `discount_end_date`      DATE         NULL     DEFAULT NULL,
  `created_at`             DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`             DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_subscription_firebase` (`firebase_id`),
  KEY `ix_subscription_status_billing` (`status`, `next_billing_date`),
  KEY `ix_subscription_status_trial`   (`status`, `trial_end`),
  CONSTRAINT `fk_subscription_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `subscription_plan` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. payment_method
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payment_method` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `firebase_id`     VARCHAR(255) NOT NULL,
  `cardcom_token`   VARCHAR(512) NOT NULL COMMENT 'TODO: must be encrypted at rest before production',
  `last4`           VARCHAR(4)   NULL     DEFAULT NULL,
  `card_brand`      VARCHAR(50)  NULL     DEFAULT NULL,
  `created_at`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at`      DATETIME(6)  NULL     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_payment_method_firebase` (`firebase_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add FK from subscription to payment_method (payment_method created after subscription table)
ALTER TABLE `subscription`
  ADD CONSTRAINT `fk_subscription_payment_method`
    FOREIGN KEY (`payment_method_id`) REFERENCES `payment_method` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- 4. promotion
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `promotion` (
  `id`                      INT          NOT NULL AUTO_INCREMENT,
  `name`                    VARCHAR(255) NOT NULL,
  `description`             TEXT         NULL     DEFAULT NULL,
  `discount_type`           ENUM('PERCENT','FIXED_AMOUNT','FIXED_PRICE') NOT NULL,
  `discount_value_agorot`   INT          NULL     DEFAULT NULL,
  `discount_percent`        INT          NULL     DEFAULT NULL,
  `duration_type`           ENUM('ONCE','REPEATING','FOREVER') NOT NULL,
  `duration_months`         INT          NULL     DEFAULT NULL,
  `priority`                INT          NOT NULL DEFAULT 0,
  `starts_at`               DATETIME     NULL     DEFAULT NULL,
  `ends_at`                 DATETIME     NULL     DEFAULT NULL,
  `max_redemptions`         INT          NULL     DEFAULT NULL,
  `current_redemptions`     INT          NOT NULL DEFAULT 0,
  `is_active`               TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at`              DATETIME(6)  NULL     DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. promotion_plan (join table)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `promotion_plan` (
  `promotion_id`   INT NOT NULL,
  `plan_id`        INT NOT NULL,
  PRIMARY KEY (`promotion_id`, `plan_id`),
  CONSTRAINT `fk_promotion_plan_promotion`
    FOREIGN KEY (`promotion_id`) REFERENCES `promotion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_promotion_plan_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `subscription_plan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. coupon
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `coupon` (
  `id`                        INT          NOT NULL AUTO_INCREMENT,
  `code`                      VARCHAR(100) NOT NULL,
  `name`                      VARCHAR(255) NOT NULL,
  `description`               TEXT         NULL     DEFAULT NULL,
  `discount_type`             ENUM('PERCENT','FIXED_AMOUNT','FIXED_PRICE') NOT NULL,
  `discount_value_agorot`     INT          NULL     DEFAULT NULL,
  `discount_percent`          INT          NULL     DEFAULT NULL,
  `duration_type`             ENUM('ONCE','REPEATING','FOREVER') NOT NULL,
  `duration_months`           INT          NULL     DEFAULT NULL,
  `starts_at`                 DATETIME     NULL     DEFAULT NULL,
  `ends_at`                   DATETIME     NULL     DEFAULT NULL,
  `max_redemptions`           INT          NULL     DEFAULT NULL,
  `current_redemptions`       INT          NOT NULL DEFAULT 0,
  `max_redemptions_per_user`  INT          NOT NULL DEFAULT 1,
  `is_active`                 TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`                DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`                DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at`                DATETIME(6)  NULL     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_coupon_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. coupon_plan (join table)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `coupon_plan` (
  `coupon_id`   INT NOT NULL,
  `plan_id`     INT NOT NULL,
  PRIMARY KEY (`coupon_id`, `plan_id`),
  CONSTRAINT `fk_coupon_plan_coupon`
    FOREIGN KEY (`coupon_id`) REFERENCES `coupon` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_coupon_plan_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `subscription_plan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 8. subscription_discount
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_discount` (
  `id`                      INT          NOT NULL AUTO_INCREMENT,
  `subscription_id`         INT          NOT NULL,
  `discount_type`           ENUM('PERCENT','FIXED_AMOUNT','FIXED_PRICE') NOT NULL,
  `discount_value_agorot`   INT          NULL     DEFAULT NULL,
  `discount_percent`        INT          NULL     DEFAULT NULL,
  `duration_type`           ENUM('ONCE','REPEATING','FOREVER') NOT NULL,
  `duration_months`         INT          NULL     DEFAULT NULL,
  `reason_code`             VARCHAR(100) NULL     DEFAULT NULL,
  `note`                    TEXT         NULL     DEFAULT NULL,
  `created_by_firebase_id`  VARCHAR(255) NULL     DEFAULT NULL,
  `approved_at`             DATETIME     NULL     DEFAULT NULL,
  `starts_at`               DATETIME     NULL     DEFAULT NULL,
  `ends_at`                 DATETIME     NULL     DEFAULT NULL,
  `is_active`               TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at`              DATETIME(6)  NULL     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_subscription_discount_active` (`subscription_id`, `is_active`),
  CONSTRAINT `fk_subscription_discount_subscription`
    FOREIGN KEY (`subscription_id`) REFERENCES `subscription` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 9. cardcom_checkout_session
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cardcom_checkout_session` (
  `id`                        INT           NOT NULL AUTO_INCREMENT,
  `firebase_id`               VARCHAR(255)  NOT NULL,
  `subscription_id`           INT           NOT NULL,
  `plan_id`                   INT           NOT NULL,
  `status`                    ENUM('PENDING','COMPLETED','FAILED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  `original_amount_agorot`    INT           NOT NULL,
  `discount_amount_agorot`    INT           NOT NULL DEFAULT 0,
  `final_amount_agorot`       INT           NOT NULL,
  `currency`                  VARCHAR(3)    NOT NULL DEFAULT 'ILS',
  `coupon_id`                 INT           NULL     DEFAULT NULL,
  `promotion_id`              INT           NULL     DEFAULT NULL,
  `subscription_discount_id`  INT           NULL     DEFAULT NULL,
  `cardcom_low_profile_id`    VARCHAR(255)  NULL     DEFAULT NULL,
  `cardcom_deal_number`       VARCHAR(255)  NULL     DEFAULT NULL,
  `cardcom_document_number`   VARCHAR(255)  NULL     DEFAULT NULL,
  `cardcom_document_type`     VARCHAR(100)  NULL     DEFAULT NULL,
  `cardcom_document_url`      VARCHAR(2048) NULL     DEFAULT NULL,
  `paid_at`                   DATETIME      NULL     DEFAULT NULL,
  `webhook_received_at`       DATETIME      NULL     DEFAULT NULL,
  `verified_at`               DATETIME      NULL     DEFAULT NULL,
  `expires_at`                DATETIME      NOT NULL,
  `raw_cardcom_response`      JSON          NULL     DEFAULT NULL,
  `created_at`                DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`                DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `ix_checkout_status_expires`  (`status`, `expires_at`),
  KEY `ix_checkout_low_profile`     (`cardcom_low_profile_id`),
  KEY `ix_checkout_deal_number`     (`cardcom_deal_number`),
  CONSTRAINT `fk_checkout_subscription`
    FOREIGN KEY (`subscription_id`) REFERENCES `subscription` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_checkout_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `subscription_plan` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_checkout_coupon`
    FOREIGN KEY (`coupon_id`) REFERENCES `coupon` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_checkout_promotion`
    FOREIGN KEY (`promotion_id`) REFERENCES `promotion` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_checkout_subscription_discount`
    FOREIGN KEY (`subscription_discount_id`) REFERENCES `subscription_discount` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 10. cardcom_webhook_log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cardcom_webhook_log` (
  `id`                   INT          NOT NULL AUTO_INCREMENT,
  `checkout_session_id`  INT          NULL     DEFAULT NULL,
  `idempotency_key`      VARCHAR(512) NOT NULL,
  `event_type`           VARCHAR(128) NULL     DEFAULT NULL,
  `payload`              JSON         NOT NULL,
  `status`               ENUM('RECEIVED','PROCESSED','FAILED','IGNORED') NOT NULL DEFAULT 'RECEIVED',
  `processed_at`         DATETIME     NULL     DEFAULT NULL,
  `error_message`        TEXT         NULL     DEFAULT NULL,
  `received_at`          DATETIME     NOT NULL,
  `created_at`           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_webhook_idempotency` (`idempotency_key`),
  CONSTRAINT `fk_webhook_log_checkout_session`
    FOREIGN KEY (`checkout_session_id`) REFERENCES `cardcom_checkout_session` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 11. billing_event
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `billing_event` (
  `id`                     INT           NOT NULL AUTO_INCREMENT,
  `firebase_id`            VARCHAR(255)  NOT NULL,
  `subscription_id`        INT           NULL     DEFAULT NULL,
  `checkout_session_id`    INT           NULL     DEFAULT NULL,
  `payment_method_id`      INT           NULL     DEFAULT NULL,
  `event_type`             ENUM(
                             'CHECKOUT_CREATED','WEBHOOK_RECEIVED','PAYMENT_VERIFIED',
                             'PAYMENT_SUCCESS','PAYMENT_FAILED','SUBSCRIPTION_ACTIVATED',
                             'SUBSCRIPTION_CANCELED','RENEWAL_SUCCESS','RENEWAL_FAILED',
                             'RETRY_SCHEDULED','PLAN_CHANGE_REQUESTED','PLAN_CHANGED',
                             'COUPON_REDEEMED','PROMOTION_APPLIED','DISCOUNT_APPLIED'
                           ) NOT NULL,
  `amount_agorot`          INT           NULL     DEFAULT NULL,
  `currency`               VARCHAR(3)    NOT NULL DEFAULT 'ILS',
  `cardcom_deal_number`    VARCHAR(255)  NULL     DEFAULT NULL,
  `cardcom_document_number` VARCHAR(255) NULL     DEFAULT NULL,
  `cardcom_document_type`  VARCHAR(100)  NULL     DEFAULT NULL,
  `cardcom_document_url`   VARCHAR(2048) NULL     DEFAULT NULL,
  `metadata`               JSON          NULL     DEFAULT NULL,
  `created_at`             DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `ix_billing_event_subscription` (`subscription_id`, `created_at`),
  KEY `ix_billing_event_user`         (`firebase_id`, `created_at`),
  KEY `ix_billing_event_type`         (`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 12. coupon_redemption
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `coupon_redemption` (
  `id`                     INT          NOT NULL AUTO_INCREMENT,
  `coupon_id`              INT          NOT NULL,
  `firebase_id`            VARCHAR(255) NOT NULL,
  `subscription_id`        INT          NOT NULL,
  `checkout_session_id`    INT          NULL     DEFAULT NULL,
  `redeemed_amount_agorot` INT          NOT NULL,
  `redeemed_at`            DATETIME     NOT NULL,
  `created_at`             DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_coupon_redemption_user`         (`coupon_id`, `firebase_id`),
  KEY `ix_coupon_redemption_subscription`        (`subscription_id`),
  CONSTRAINT `fk_coupon_redemption_coupon`
    FOREIGN KEY (`coupon_id`) REFERENCES `coupon` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_coupon_redemption_subscription`
    FOREIGN KEY (`subscription_id`) REFERENCES `subscription` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_coupon_redemption_checkout`
    FOREIGN KEY (`checkout_session_id`) REFERENCES `cardcom_checkout_session` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 13. subscription_cancellation
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_cancellation` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `subscription_id` INT          NOT NULL,
  `firebase_id`     VARCHAR(255) NOT NULL,
  `reason_code`     ENUM('TOO_EXPENSIVE','MISSING_FEATURE','NOT_USING_ENOUGH',
                         'FOUND_ALTERNATIVE','TECHNICAL_ISSUES','OTHER') NOT NULL,
  `feedback_text`   TEXT         NULL     DEFAULT NULL,
  `canceled_at`     DATETIME     NOT NULL,
  `created_at`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `ix_subscription_cancellation_sub` (`subscription_id`),
  CONSTRAINT `fk_cancellation_subscription`
    FOREIGN KEY (`subscription_id`) REFERENCES `subscription` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 14. subscription_plan_change
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_plan_change` (
  `id`              INT         NOT NULL AUTO_INCREMENT,
  `subscription_id` INT         NOT NULL,
  `from_plan_id`    INT         NOT NULL,
  `to_plan_id`      INT         NOT NULL,
  `change_type`     ENUM('UPGRADE','DOWNGRADE') NOT NULL,
  `status`          ENUM('PENDING','APPLIED','CANCELED','FAILED') NOT NULL DEFAULT 'PENDING',
  `scheduled_for`   DATETIME    NULL     DEFAULT NULL,
  `requested_at`    DATETIME    NOT NULL,
  `applied_at`      DATETIME    NULL     DEFAULT NULL,
  `reason`          TEXT        NULL     DEFAULT NULL,
  `created_at`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `ix_plan_change_subscription_status` (`subscription_id`, `status`),
  KEY `ix_plan_change_status_scheduled`    (`status`, `scheduled_for`),
  CONSTRAINT `fk_plan_change_subscription`
    FOREIGN KEY (`subscription_id`) REFERENCES `subscription` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_plan_change_from_plan`
    FOREIGN KEY (`from_plan_id`) REFERENCES `subscription_plan` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_plan_change_to_plan`
    FOREIGN KEY (`to_plan_id`) REFERENCES `subscription_plan` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- End of billing_foundation_schema migration
-- ============================================================
