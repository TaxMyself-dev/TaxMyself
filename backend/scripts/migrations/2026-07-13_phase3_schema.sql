-- ============================================================================
-- Phase 3.1 — D6 schema: expense FK/snapshot/description/approval columns,
-- plus subCategoryId shadow pointers on supplier/classified_transactions/
-- extracted_document and extracted_document.document_kind (D8).
--
-- Two-step, matching the established chart_renumber/catalog_migration
-- pattern: this DDL runs FIRST (raw connection, no NestJS boot — the app's
-- entities already declare the renamed/new columns, so booting against the
-- pre-DDL schema would 1054 on the very first Expense query). The data
-- backfill (2026-07-13_phase3_backfill.ts) runs second, once these columns
-- exist.
--
-- `RENAME COLUMN` (MySQL 8.0.8+; this DB is 8.0.37 per schema-drift.md)
-- preserves the column's existing type/precision exactly — no data copy,
-- matching D6's explicit "rename-in-place ... no data copy needed".
-- ============================================================================

ALTER TABLE `expense`
  RENAME COLUMN `taxPercent` TO `taxPercentSnapshot`,
  RENAME COLUMN `vatPercent` TO `vatPercentSnapshot`,
  RENAME COLUMN `isEquipment` TO `isEquipmentSnapshot`,
  RENAME COLUMN `reductionPercent` TO `reductionPercentSnapshot`;

ALTER TABLE `expense`
  ADD COLUMN `subCategoryId` int NULL DEFAULT NULL,
  ADD COLUMN `sectionIdSnapshot` int NULL DEFAULT NULL,
  ADD COLUMN `sectionCodeSnapshot` varchar(255) NULL DEFAULT NULL,
  ADD COLUMN `sectionNameSnapshot` varchar(255) NULL DEFAULT NULL,
  ADD COLUMN `accountIdSnapshot` int NULL DEFAULT NULL,
  ADD COLUMN `accountCodeSnapshot` varchar(255) NULL DEFAULT NULL,
  ADD COLUMN `accountNameSnapshot` varchar(255) NULL DEFAULT NULL,
  ADD COLUMN `code6111Snapshot` varchar(255) NULL DEFAULT NULL,
  ADD COLUMN `description` varchar(255) NULL DEFAULT NULL,
  ADD COLUMN `approvalStatus` ENUM('PENDING','APPROVED','REJECTED','MISSING_ACCOUNTING_MAPPING','NOT_AN_EXPENSE') NULL DEFAULT NULL,
  ADD COLUMN `approvedByUserId` varchar(255) NULL DEFAULT NULL,
  ADD COLUMN `approvedAt` datetime NULL DEFAULT NULL,
  ADD COLUMN `classificationOverrideByUserId` varchar(255) NULL DEFAULT NULL,
  ADD COLUMN `classificationOverrideAt` datetime NULL DEFAULT NULL;

ALTER TABLE `supplier`
  ADD COLUMN `subCategoryId` int NULL DEFAULT NULL;

ALTER TABLE `classified_transactions`
  ADD COLUMN `subCategoryId` int NULL DEFAULT NULL;

ALTER TABLE `extracted_document`
  ADD COLUMN `sub_category_id` int NULL DEFAULT NULL,
  ADD COLUMN `document_kind` varchar(32) NULL DEFAULT NULL;

-- Verification (run after applying, before the backfill script):
--   SHOW COLUMNS FROM expense LIKE '%Snapshot';               -- expect 4 renamed + none dropped
--   SHOW COLUMNS FROM expense LIKE 'subCategoryId';           -- expect 1 row
--   SHOW COLUMNS FROM expense LIKE 'approvalStatus';          -- expect 1 row, type enum(...)
--   SHOW COLUMNS FROM supplier LIKE 'subCategoryId';          -- expect 1 row
--   SHOW COLUMNS FROM classified_transactions LIKE 'subCategoryId'; -- expect 1 row
--   SHOW COLUMNS FROM extracted_document LIKE 'sub_category_id'; -- expect 1 row
--   SHOW COLUMNS FROM extracted_document LIKE 'document_kind';   -- expect 1 row
--   SELECT COUNT(*) FROM expense;  -- expect 85 (D14), unchanged by a pure schema ALTER
