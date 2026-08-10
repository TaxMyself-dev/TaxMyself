-- ============================================================================
-- Archive page — `source` (RecordSource) column on `expense` and
-- `extracted_document`, powering the "מקור העלאה" column on the ארכיון שלי
-- page. 100% additive. In dev, TypeORM synchronize handles this
-- automatically; this file is for prod.
--
-- extracted_document.source defaults to DRIVE (every row today comes from
-- the Drive inbox OCR pipeline — see documents.service.ts's insert sites),
-- so no backfill is needed there beyond the DEFAULT.
--
-- expense.source is nullable and backfilled below from the two existing
-- provenance pointers, matching ExpensesService.addExpense's inference
-- logic (source_document_id set -> DRIVE, else externalTransactionId set
-- -> OPEN_BANKING, else -> MANUAL). Note the column-name mismatch: the
-- Expense entity gives `sourceDocumentId` an explicit snake_case override
-- (`source_document_id`), but `externalTransactionId` has no override and
-- stays camelCase in the DB — this matches TypeORM's actual generated
-- schema, not a consistent naming convention:
--   source_document_id IS NOT NULL     -> DRIVE
--   externalTransactionId IS NOT NULL  -> OPEN_BANKING
--   otherwise                          -> MANUAL
-- ============================================================================

ALTER TABLE `extracted_document`
  ADD COLUMN `source` varchar(20) NOT NULL DEFAULT 'DRIVE';

ALTER TABLE `expense`
  ADD COLUMN `source` varchar(20) NULL DEFAULT NULL;

UPDATE `expense`
  SET `source` = 'DRIVE'
  WHERE `source_document_id` IS NOT NULL;

UPDATE `expense`
  SET `source` = 'OPEN_BANKING'
  WHERE `source` IS NULL AND `externalTransactionId` IS NOT NULL;

UPDATE `expense`
  SET `source` = 'MANUAL'
  WHERE `source` IS NULL;

-- Verification (run after applying):
--   SHOW COLUMNS FROM extracted_document LIKE 'source';  -- expect 1 row, varchar(20) NOT NULL DEFAULT 'DRIVE'
--   SHOW COLUMNS FROM expense LIKE 'source';              -- expect 1 row, varchar(20) NULL
--   SELECT source, COUNT(*) FROM expense GROUP BY source; -- expect no NULLs remaining
