-- Optional, document-owned bank transfer instructions (no payment/accounting effects).
-- Apply before deploying/booting this version; nullable preserves legacy documents.
-- Idempotent on MySQL versions without ADD COLUMN IF NOT EXISTS.
SET @transfer_details_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'transfer_details') = 0,
  'ALTER TABLE `documents` ADD COLUMN `transfer_details` JSON NULL',
  'SELECT 1');
PREPARE transfer_details_stmt FROM @transfer_details_ddl;
EXECUTE transfer_details_stmt;
DEALLOCATE PREPARE transfer_details_stmt;
