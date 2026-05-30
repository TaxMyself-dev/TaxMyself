-- =====================================================================
-- Migration: Drive + Claude OCR feature schema (full)
-- Date: 2026-05-30
-- =====================================================================
-- All entity changes made during the Drive OCR feature, consolidated.
-- 100% additive — no existing data is touched, no nullability tightened,
-- no columns renamed. Safe to apply on a live DB.
--
-- If you've already applied `2026-05-26_add_drive_folder_id_to_user.sql`,
-- skip section 1 (ALTER on `user`); the other two sections still need to
-- run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. `user` table — new column for the user's Drive root folder id
-- ---------------------------------------------------------------------
-- Populated lazily on first login / sync, or eagerly when an accountant
-- creates a new client. NULL means "not provisioned yet".
ALTER TABLE `user`
  ADD COLUMN `drive_folder_id` VARCHAR(255) NULL DEFAULT NULL;


-- ---------------------------------------------------------------------
-- 2. `business` table — new column for the per-business Drive sub-folder
-- ---------------------------------------------------------------------
-- Each business gets its own sub-folder under the user's root, scaffolded
-- with year/month folders + "דוח שנתי". NULL = not provisioned yet.
ALTER TABLE `business`
  ADD COLUMN `drive_folder_id` VARCHAR(255) NULL DEFAULT NULL;


-- ---------------------------------------------------------------------
-- 3. `extracted_document` table — OCR staging (one row per invoice)
-- ---------------------------------------------------------------------
-- Stores Claude's OCR output for each invoice extracted from a Drive
-- file. A single PDF that contains multiple invoices (e.g., a monthly
-- fuel statement) becomes N rows differentiated by `sub_index` 0..N-1.
-- Rows live here until the user confirms them in the review dialog;
-- on confirm we set `confirmed_expense_id` and the row drops out of
-- the review list.
CREATE TABLE IF NOT EXISTS `extracted_document` (
  `id`                  INT             NOT NULL AUTO_INCREMENT,
  `user_id`             INT             NOT NULL,
  `business_number`     VARCHAR(32)         NULL DEFAULT NULL,
  `drive_file_id`       VARCHAR(255)    NOT NULL,
  `sub_index`           INT             NOT NULL DEFAULT 0,
  `drive_file_name`     VARCHAR(512)    NOT NULL,
  `month`               VARCHAR(7)      NOT NULL,                    -- 'YYYY-MM'
  `supplier`            VARCHAR(255)        NULL DEFAULT NULL,
  `supplier_id`         VARCHAR(32)         NULL DEFAULT NULL,        -- מס׳ עוסק / ח.פ.
  `date`                DATE                NULL DEFAULT NULL,
  `invoice_number`      VARCHAR(128)        NULL DEFAULT NULL,
  `allocation_number`   VARCHAR(64)         NULL DEFAULT NULL,        -- מספר הקצאה
  `amount`              DECIMAL(12, 2)      NULL DEFAULT NULL,
  `vat`                 DECIMAL(12, 2)      NULL DEFAULT NULL,
  `amount_before_vat`   DECIMAL(12, 2)      NULL DEFAULT NULL,
  `category`            VARCHAR(64)         NULL DEFAULT NULL,
  `sub_category`        VARCHAR(128)        NULL DEFAULT NULL,
  `tax_percent`         DECIMAL(6, 2)       NULL DEFAULT NULL,
  `vat_percent`         DECIMAL(6, 2)       NULL DEFAULT NULL,
  `is_equipment`        TINYINT(1)          NULL DEFAULT NULL,        -- ציוד / רכוש קבוע → פחת
  `description`         TEXT                NULL,
  `status`              ENUM('pending','processed','error')
                                        NOT NULL DEFAULT 'pending',
  `raw_response`        TEXT                NULL,                     -- full Claude response (1st row of multi-invoice file only)
  `confirmed_expense_id` INT                NULL DEFAULT NULL,        -- set → row falls out of review list
  `created_at`          DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`          DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                        ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  -- One Drive file ↔ at most one row per sub-index. Lets multi-invoice
  -- files store N rows without violating uniqueness.
  UNIQUE INDEX `uq_extracted_document_file_subindex` (`drive_file_id`, `sub_index`),
  -- Powers the review query `WHERE user_id=? AND business_number=? AND month IN (...)`.
  INDEX `ix_extracted_document_user_business_month` (`user_id`, `business_number`, `month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
