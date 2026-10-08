-- Billing release schema, MySQL 8.0.37. Prepared from reviewed cutover sections 20/21.
-- Take a database backup and pause billing writers before execution.
-- Run this file as one import in phpMyAdmin. Stop on any SQL error.
-- No charges are initiated. Existing subscriptions/cards/receipts are not reset.
USE `keepintax-prod`;
SET SESSION group_concat_max_len = 100000;

SET @kt032_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription'
      AND COLUMN_NAME = 'billing_anchor_day'
  ),
  'SELECT 1',
  'ALTER TABLE `subscription` ADD COLUMN `billing_anchor_day` tinyint NULL DEFAULT NULL AFTER `next_billing_date`'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription' AND COLUMN_NAME = 'active_payment_method_update_attempt_id'),
  'SELECT 1',
  'ALTER TABLE `subscription` ADD COLUMN `active_payment_method_update_attempt_id` int NULL DEFAULT NULL AFTER `payment_method_id`'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_method' AND COLUMN_NAME = 'source_update_attempt_id'),
  'SELECT 1',
  'ALTER TABLE `payment_method` ADD COLUMN `source_update_attempt_id` int NULL DEFAULT NULL AFTER `card_expiry_year`'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_method' AND COLUMN_NAME = 'cardcom_token_delete_at'),
  'SELECT 1',
  'ALTER TABLE `payment_method` ADD COLUMN `cardcom_token_delete_at` datetime NULL DEFAULT NULL AFTER `source_update_attempt_id`'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'billing_attempt_id'),
  'SELECT 1',
  'ALTER TABLE `documents` ADD COLUMN `billing_attempt_id` int NULL DEFAULT NULL'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

CREATE TABLE IF NOT EXISTS `billing_obligation` (
  `id` int NOT NULL AUTO_INCREMENT,
  `subscription_id` int NOT NULL,
  `firebase_id_snapshot` varchar(255) NOT NULL,
  `plan_id` int NOT NULL,
  `obligation_key` varchar(191) NOT NULL,
  `kind` enum('CHECKOUT','RECURRING_PERIOD') NOT NULL,
  `status` enum('OPEN','SATISFIED','CANCELED','MANUAL_REVIEW') NOT NULL DEFAULT 'OPEN',
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `amount_agorot` int NOT NULL,
  `amount_before_vat_agorot` int NOT NULL,
  `vat_amount_agorot` int NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'ILS',
  `active_attempt_id` int NULL DEFAULT NULL,
  `satisfied_attempt_id` int NULL DEFAULT NULL,
  `version` int NOT NULL DEFAULT 0,
  `satisfied_at` datetime NULL DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_billing_obligation_key` (`obligation_key`),
  UNIQUE KEY `ux_billing_obligation_active_attempt` (`active_attempt_id`),
  UNIQUE KEY `ux_billing_obligation_satisfied_attempt` (`satisfied_attempt_id`),
  KEY `ix_billing_obligation_subscription_status` (`subscription_id`, `status`),
  KEY `ix_billing_obligation_status_updated` (`status`, `updated_at`),
  CONSTRAINT `ck_billing_obligation_period` CHECK (`period_end` > `period_start`),
  CONSTRAINT `ck_billing_obligation_amounts` CHECK (
    `amount_agorot` >= 0 AND `amount_before_vat_agorot` >= 0
    AND `vat_amount_agorot` >= 0
    AND `amount_before_vat_agorot` + `vat_amount_agorot` = `amount_agorot`
  ),
  CONSTRAINT `fk_billing_obligation_subscription`
    FOREIGN KEY (`subscription_id`) REFERENCES `subscription` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_billing_obligation_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `subscription_plan` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `billing_attempt` (
  `id` int NOT NULL AUTO_INCREMENT,
  `obligation_id` int NOT NULL,
  `attempt_number` int NOT NULL,
  `trigger` enum('CHECKOUT','RENEWAL','RECOVERY','MANUAL_RETRY') NOT NULL,
  `charge_mode` enum('TOKEN_TRANSACTION','LOW_PROFILE_HOSTED') NOT NULL,
  `status` enum('CREATED','AWAITING_CUSTOMER','PROCESSING','UNKNOWN','CAPTURED','COMPLETED','DECLINED','CANCELED','EXPIRED','MANUAL_REVIEW') NOT NULL DEFAULT 'CREATED',
  `payment_method_id` int NULL DEFAULT NULL,
  `cardcom_external_uniq_tran_id` varchar(25) NOT NULL,
  `cardcom_low_profile_id` varchar(255) NULL DEFAULT NULL,
  `provider_terminal_ref` varchar(100) NULL DEFAULT NULL,
  `cardcom_transaction_id` varchar(128) NULL DEFAULT NULL,
  `provider_response_code` int NULL DEFAULT NULL,
  `failure_category` varchar(64) NULL DEFAULT NULL,
  `plan_id` int NOT NULL,
  `amount_agorot` int NOT NULL,
  `amount_before_vat_agorot` int NOT NULL,
  `vat_amount_agorot` int NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'ILS',
  `receipt_doc_id` int NULL DEFAULT NULL,
  `lease_owner` varchar(191) NULL DEFAULT NULL,
  `lease_expires_at` datetime NULL DEFAULT NULL,
  `state_version` int NOT NULL DEFAULT 0,
  `next_action_at` datetime NULL DEFAULT NULL,
  `unknown_since` datetime NULL DEFAULT NULL,
  `submitted_at` datetime NULL DEFAULT NULL,
  `captured_at` datetime NULL DEFAULT NULL,
  `completed_at` datetime NULL DEFAULT NULL,
  `reconciliation_attempts` int NOT NULL DEFAULT 0,
  `last_reconciled_at` datetime NULL DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_billing_attempt_number` (`obligation_id`, `attempt_number`),
  UNIQUE KEY `ux_billing_attempt_external_uniq` (`cardcom_external_uniq_tran_id`),
  UNIQUE KEY `ux_billing_attempt_low_profile` (`cardcom_low_profile_id`),
  UNIQUE KEY `ux_billing_attempt_receipt` (`receipt_doc_id`),
  KEY `ix_billing_attempt_status_action` (`status`, `next_action_at`),
  KEY `ix_billing_attempt_lease_status` (`lease_expires_at`, `status`),
  KEY `ix_billing_attempt_obligation_status` (`obligation_id`, `status`),
  CONSTRAINT `ck_billing_attempt_number` CHECK (`attempt_number` > 0),
  CONSTRAINT `ck_billing_attempt_amounts` CHECK (
    `amount_agorot` >= 0 AND `amount_before_vat_agorot` >= 0
    AND `vat_amount_agorot` >= 0
    AND `amount_before_vat_agorot` + `vat_amount_agorot` = `amount_agorot`
  ),
  CONSTRAINT `fk_billing_attempt_obligation`
    FOREIGN KEY (`obligation_id`) REFERENCES `billing_obligation` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_billing_attempt_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `subscription_plan` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_billing_attempt_payment_method`
    FOREIGN KEY (`payment_method_id`) REFERENCES `payment_method` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_billing_attempt_receipt`
    FOREIGN KEY (`receipt_doc_id`) REFERENCES `documents` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @kt032_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'fk_billing_obligation_active_attempt'
  ),
  'SELECT 1',
  'ALTER TABLE `billing_obligation` ADD CONSTRAINT `fk_billing_obligation_active_attempt` FOREIGN KEY (`active_attempt_id`) REFERENCES `billing_attempt` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'fk_billing_obligation_satisfied_attempt'
  ),
  'SELECT 1',
  'ALTER TABLE `billing_obligation` ADD CONSTRAINT `fk_billing_obligation_satisfied_attempt` FOREIGN KEY (`satisfied_attempt_id`) REFERENCES `billing_attempt` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

CREATE TABLE IF NOT EXISTS `payment_method_update_attempt` (
  `id` int NOT NULL AUTO_INCREMENT,
  `public_token` varchar(191) NOT NULL,
  `subscription_id` int NOT NULL,
  `firebase_id_snapshot` varchar(255) NOT NULL,
  `status` enum('CREATED','AWAITING_CUSTOMER','VERIFYING','UNKNOWN','SUCCEEDED','FAILED','SUPERSEDED','EXPIRED','MANUAL_REVIEW') NOT NULL DEFAULT 'CREATED',
  `cardcom_low_profile_id` varchar(255) NULL DEFAULT NULL,
  `return_value_version` smallint NOT NULL DEFAULT 1,
  `previous_payment_method_id` int NULL DEFAULT NULL,
  `result_payment_method_id` int NULL DEFAULT NULL,
  `provider_response_code` int NULL DEFAULT NULL,
  `failure_category` varchar(64) NULL DEFAULT NULL,
  `lease_owner` varchar(191) NULL DEFAULT NULL,
  `lease_expires_at` datetime NULL DEFAULT NULL,
  `state_version` int NOT NULL DEFAULT 0,
  `next_action_at` datetime NULL DEFAULT NULL,
  `verification_attempts` int NOT NULL DEFAULT 0,
  `token_delete_at` datetime NULL DEFAULT NULL,
  `completed_at` datetime NULL DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_payment_method_update_public_token` (`public_token`),
  UNIQUE KEY `ux_payment_method_update_low_profile` (`cardcom_low_profile_id`),
  UNIQUE KEY `ux_payment_method_update_result` (`result_payment_method_id`),
  KEY `ix_payment_method_update_subscription_status` (`subscription_id`, `status`),
  KEY `ix_payment_method_update_status_action` (`status`, `next_action_at`),
  CONSTRAINT `fk_payment_method_update_subscription`
    FOREIGN KEY (`subscription_id`) REFERENCES `subscription` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_method_update_previous_method`
    FOREIGN KEY (`previous_payment_method_id`) REFERENCES `payment_method` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_method_update_result_method`
    FOREIGN KEY (`result_payment_method_id`) REFERENCES `payment_method` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_method' AND INDEX_NAME = 'ux_payment_method_source_update_attempt'),
  'SELECT 1',
  'ALTER TABLE `payment_method` ADD UNIQUE KEY `ux_payment_method_source_update_attempt` (`source_update_attempt_id`)'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND INDEX_NAME = 'ux_documents_billing_attempt'),
  'SELECT 1',
  'ALTER TABLE `documents` ADD UNIQUE KEY `ux_documents_billing_attempt` (`billing_attempt_id`)'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_subscription_active_payment_method_update'),
  'SELECT 1',
  'ALTER TABLE `subscription` ADD CONSTRAINT `fk_subscription_active_payment_method_update` FOREIGN KEY (`active_payment_method_update_attempt_id`) REFERENCES `payment_method_update_attempt` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_payment_method_source_update_attempt'),
  'SELECT 1',
  'ALTER TABLE `payment_method` ADD CONSTRAINT `fk_payment_method_source_update_attempt` FOREIGN KEY (`source_update_attempt_id`) REFERENCES `payment_method_update_attempt` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_documents_billing_attempt'),
  'SELECT 1',
  'ALTER TABLE `documents` ADD CONSTRAINT `fk_documents_billing_attempt` FOREIGN KEY (`billing_attempt_id`) REFERENCES `billing_attempt` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_event' AND COLUMN_NAME = 'billing_obligation_id'),
  'SELECT 1',
  'ALTER TABLE `billing_event` ADD COLUMN `billing_obligation_id` int NULL DEFAULT NULL AFTER `payment_method_id`'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_event' AND COLUMN_NAME = 'billing_attempt_id'),
  'SELECT 1',
  'ALTER TABLE `billing_event` ADD COLUMN `billing_attempt_id` int NULL DEFAULT NULL AFTER `billing_obligation_id`'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_event' AND COLUMN_NAME = 'payment_method_update_attempt_id'),
  'SELECT 1',
  'ALTER TABLE `billing_event` ADD COLUMN `payment_method_update_attempt_id` int NULL DEFAULT NULL AFTER `billing_attempt_id`'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_event' AND INDEX_NAME = 'ix_billing_event_obligation'),
  'SELECT 1',
  'ALTER TABLE `billing_event` ADD KEY `ix_billing_event_obligation` (`billing_obligation_id`, `created_at`)'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_event' AND INDEX_NAME = 'ix_billing_event_attempt'),
  'SELECT 1',
  'ALTER TABLE `billing_event` ADD KEY `ix_billing_event_attempt` (`billing_attempt_id`, `created_at`)'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_event' AND INDEX_NAME = 'ix_billing_event_payment_method_update'),
  'SELECT 1',
  'ALTER TABLE `billing_event` ADD KEY `ix_billing_event_payment_method_update` (`payment_method_update_attempt_id`, `created_at`)'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_billing_event_obligation'),
  'SELECT 1',
  'ALTER TABLE `billing_event` ADD CONSTRAINT `fk_billing_event_obligation` FOREIGN KEY (`billing_obligation_id`) REFERENCES `billing_obligation` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_billing_event_attempt'),
  'SELECT 1',
  'ALTER TABLE `billing_event` ADD CONSTRAINT `fk_billing_event_attempt` FOREIGN KEY (`billing_attempt_id`) REFERENCES `billing_attempt` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_billing_event_payment_method_update'),
  'SELECT 1',
  'ALTER TABLE `billing_event` ADD CONSTRAINT `fk_billing_event_payment_method_update` FOREIGN KEY (`payment_method_update_attempt_id`) REFERENCES `payment_method_update_attempt` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;

SET @kt032_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription' AND CONSTRAINT_NAME = 'ck_subscription_billing_anchor'),
  'SELECT 1',
  'ALTER TABLE `subscription` ADD CONSTRAINT `ck_subscription_billing_anchor` CHECK (`billing_anchor_day` IS NULL OR `billing_anchor_day` BETWEEN 1 AND 31)'
);
PREPARE kt032_stmt FROM @kt032_sql;
EXECUTE kt032_stmt;
DEALLOCATE PREPARE kt032_stmt;


CREATE TABLE IF NOT EXISTS `billing_attempt_obligation` (
  `attempt_id` int NOT NULL,
  `obligation_id` int NOT NULL,
  PRIMARY KEY (`attempt_id`, `obligation_id`),
  KEY `ix_billing_attempt_obligation_debt` (`obligation_id`),
  CONSTRAINT `fk_billing_attempt_obligation_attempt` FOREIGN KEY (`attempt_id`)
    REFERENCES `billing_attempt` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_billing_attempt_obligation_debt` FOREIGN KEY (`obligation_id`)
    REFERENCES `billing_obligation` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

INSERT INTO `billing_attempt_obligation` (`attempt_id`, `obligation_id`)
SELECT a.id, a.obligation_id FROM billing_attempt a
WHERE NOT EXISTS (SELECT 1 FROM billing_attempt_obligation l
  WHERE l.attempt_id = a.id AND l.obligation_id = a.obligation_id);

SET @kt040_sql = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_obligation'
    AND INDEX_NAME = 'ix_billing_obligation_active_attempt'), 'SELECT 1',
  'ALTER TABLE billing_obligation ADD INDEX ix_billing_obligation_active_attempt (active_attempt_id)');
PREPARE kt040_stmt FROM @kt040_sql;
EXECUTE kt040_stmt;
DEALLOCATE PREPARE kt040_stmt;
SET @kt040_sql = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_obligation'
    AND INDEX_NAME = 'ix_billing_obligation_satisfied_attempt'), 'SELECT 1',
  'ALTER TABLE billing_obligation ADD INDEX ix_billing_obligation_satisfied_attempt (satisfied_attempt_id)');
PREPARE kt040_stmt FROM @kt040_sql;
EXECUTE kt040_stmt;
DEALLOCATE PREPARE kt040_stmt;
SET @kt040_sql = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_obligation'
    AND INDEX_NAME = 'ux_billing_obligation_active_attempt'),
  'ALTER TABLE billing_obligation DROP INDEX ux_billing_obligation_active_attempt', 'SELECT 1');
PREPARE kt040_stmt FROM @kt040_sql;
EXECUTE kt040_stmt;
DEALLOCATE PREPARE kt040_stmt;
SET @kt040_sql = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_obligation'
    AND INDEX_NAME = 'ux_billing_obligation_satisfied_attempt'),
  'ALTER TABLE billing_obligation DROP INDEX ux_billing_obligation_satisfied_attempt', 'SELECT 1');
PREPARE kt040_stmt FROM @kt040_sql;
EXECUTE kt040_stmt;
DEALLOCATE PREPARE kt040_stmt;




-- Preserve existing enum values and order; append required values only if absent.
SET @billing_enum_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='subscription' AND COLUMN_NAME='status');
SET @billing_enum_missing = (SELECT GROUP_CONCAT(QUOTE(enum_value) ORDER BY enum_order SEPARATOR ',')
 FROM JSON_TABLE('["TRIAL","TRIAL_EXPIRED","ACTIVE","PAST_DUE","CANCELED"]', '$[*]' COLUMNS (
 enum_order FOR ORDINALITY, enum_value VARCHAR(100) PATH '$')) AS required_values
 WHERE LOCATE(QUOTE(enum_value), @billing_enum_type)=0);
SET @billing_enum_sql = IF(@billing_enum_missing IS NULL, 'SELECT 1',
 CONCAT('ALTER TABLE `subscription` MODIFY COLUMN `status` ',
 LEFT(@billing_enum_type, CHAR_LENGTH(@billing_enum_type)-1), ',', @billing_enum_missing, ') NOT NULL',
 CONCAT(' DEFAULT ',QUOTE('TRIAL'))));
PREPARE billing_enum_stmt FROM @billing_enum_sql;
EXECUTE billing_enum_stmt;
DEALLOCATE PREPARE billing_enum_stmt;
-- Preserve existing enum values and order; append required values only if absent.
SET @billing_enum_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billing_event' AND COLUMN_NAME='event_type');
SET @billing_enum_missing = (SELECT GROUP_CONCAT(QUOTE(enum_value) ORDER BY enum_order SEPARATOR ',')
 FROM JSON_TABLE('["CHECKOUT_CREATED","WEBHOOK_RECEIVED","PAYMENT_VERIFIED","PAYMENT_SUCCESS","PAYMENT_FAILED","SUBSCRIPTION_ACTIVATED","SUBSCRIPTION_CANCELED","RENEWAL_SUCCESS","RENEWAL_FAILED","RETRY_SCHEDULED","PLAN_CHANGE_REQUESTED","PLAN_CHANGED","PAYMENT_METHOD_UPDATE_REQUESTED","PAYMENT_METHOD_UPDATED","PAYMENT_METHOD_UPDATE_FAILED","COUPON_REDEEMED","PROMOTION_APPLIED","DISCOUNT_APPLIED","RECEIPT_FAILED","DUPLICATE_PAYMENT_IGNORED","BILLING_EXEMPTION_GRANTED","BILLING_EXEMPTION_REVOKED"]', '$[*]' COLUMNS (
 enum_order FOR ORDINALITY, enum_value VARCHAR(100) PATH '$')) AS required_values
 WHERE LOCATE(QUOTE(enum_value), @billing_enum_type)=0);
SET @billing_enum_sql = IF(@billing_enum_missing IS NULL, 'SELECT 1',
 CONCAT('ALTER TABLE `billing_event` MODIFY COLUMN `event_type` ',
 LEFT(@billing_enum_type, CHAR_LENGTH(@billing_enum_type)-1), ',', @billing_enum_missing, ') NOT NULL',
 ''));
PREPARE billing_enum_stmt FROM @billing_enum_sql;
EXECUTE billing_enum_stmt;
DEALLOCATE PREPARE billing_enum_stmt;

-- Verification: exactly four rows, with these four table names.
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN
('billing_obligation','billing_attempt','billing_attempt_obligation','payment_method_update_attempt')
ORDER BY TABLE_NAME;
-- Verification: exactly eight rows.
SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND (
(TABLE_NAME='subscription' AND COLUMN_NAME IN ('billing_anchor_day','active_payment_method_update_attempt_id')) OR
(TABLE_NAME='payment_method' AND COLUMN_NAME IN ('source_update_attempt_id','cardcom_token_delete_at')) OR
(TABLE_NAME='documents' AND COLUMN_NAME='billing_attempt_id') OR
(TABLE_NAME='billing_event' AND COLUMN_NAME IN ('billing_obligation_id','billing_attempt_id','payment_method_update_attempt_id')))
ORDER BY TABLE_NAME,COLUMN_NAME;
-- Verification: zero unlinked attempts.
SELECT COUNT(*) AS unlinked_attempts FROM billing_attempt a
LEFT JOIN billing_attempt_obligation l ON l.attempt_id=a.id AND l.obligation_id=a.obligation_id
WHERE l.attempt_id IS NULL;