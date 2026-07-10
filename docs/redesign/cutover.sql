-- ============================================================================
-- KeepInTax categories/accounting redesign — cumulative cutover script
-- ============================================================================
-- Single source of truth for every schema/data change the redesign makes.
-- Appended to at the end of every phase (see plan rule 2). Rehearsed against
-- a fresh production dump before the real cutover (see plan's cutover
-- checklist). Idempotent where possible.
--
-- Target at cutover time: production `keepintax-prod`.
-- Rehearsed throughout development against: local `keepintax_prodcopy`
-- (restored from _prod_dump/keepintax-prod.sql).
-- ============================================================================


-- ============================================================================
-- SECTION 1 (Phase 0.4) — protective UNIQUE constraints ahead of Phase 2's
-- catalog migration.
--
-- Verified against keepintax_prodcopy on 2026-07-10 (see
-- docs/redesign/production-baseline.md): ZERO duplicate rows under either
-- constraint today, so both apply cleanly with no data cleanup needed.
-- Query 3 (duplicate catalog rows) from categories-audit.md §8 found nothing
-- to clean — D14's "zero duplicate catalog rows" finding confirmed.
-- ============================================================================

ALTER TABLE `default_sub_category`
  ADD CONSTRAINT `uq_default_sub_category_name`
  UNIQUE (`categoryName`, `subCategoryName`);

-- Full-width composite (4x varchar(255) utf8mb4 = 4080 bytes) exceeds
-- InnoDB's 3072-byte max key length. Prefix the two free-text columns —
-- every observed categoryName/subCategoryName is a short Hebrew word/phrase
-- (well under 50 chars); 191 chars is the conventional utf8mb4-safe prefix
-- length. firebaseId/businessNumber are also prefixed generously (both are
-- short fixed-format identifiers in practice) to keep total key width safe.
ALTER TABLE `user_sub_category`
  ADD CONSTRAINT `uq_user_sub_category_name`
  UNIQUE (`firebaseId`(64), `businessNumber`(32), `categoryName`(191), `subCategoryName`(191));

-- Verification (run after applying, expect 0 rows from both):
-- SELECT categoryName, subCategoryName, COUNT(*) c FROM default_sub_category
--   GROUP BY categoryName, subCategoryName HAVING c > 1;
-- SELECT firebaseId, businessNumber, categoryName, subCategoryName, COUNT(*) c
--   FROM user_sub_category
--   GROUP BY firebaseId, businessNumber, categoryName, subCategoryName HAVING c > 1;


-- ============================================================================
-- SECTION 2 (Phase 0.3 / D12.4) — dedupe `business.businessNumber` and add
-- the missing UNIQUE constraint.
--
-- STAGED HERE NOW, DEPLOYED IN SESSION 8: D12 security fixes ship
-- independently of the main cutover, but this one needs an actual data
-- decision first (verified 2026-07-10, see production-baseline.md), so it's
-- written and rehearsed here rather than re-discovered from scratch later.
--
-- businessNumber '314719279' has two `business` rows — id 5 (נגרות, EXEMPT,
-- firebaseId aywY4Mhz90RzzrVU99RswfL2YUs1) and id 12 (פוטובלוק שמואל,
-- LICENSED, firebaseId CY2jmdBQ4AYH70BZARRp28j0GIi1). Both are confirmed
-- empty test/duplicate data — zero dependent rows in expense, journal_entry,
-- journal_line, documents, extracted_document, supplier,
-- classified_transactions, user_category, user_sub_category, bill,
-- accountant_task, report_workflow, delegation, annual_report,
-- slim_transactions, full_transactions_cache. Elazar's decision: delete id
-- 12, keep id 5.
-- ============================================================================

-- Pre-delete verification (expect 0 rows from every SELECT — if any of
-- these return rows when this is actually run, STOP: the "zero dependents"
-- premise no longer holds and this section needs re-review before deleting).
-- SELECT COUNT(*) FROM expense WHERE businessNumber = '314719279' AND userId = 'CY2jmdBQ4AYH70BZARRp28j0GIi1';
-- SELECT COUNT(*) FROM journal_entry WHERE issuerBusinessNumber = '314719279' AND firebaseId = 'CY2jmdBQ4AYH70BZARRp28j0GIi1';
-- SELECT COUNT(*) FROM journal_line WHERE issuerBusinessNumber = '314719279' AND firebaseId = 'CY2jmdBQ4AYH70BZARRp28j0GIi1';
-- SELECT COUNT(*) FROM documents WHERE issuerBusinessNumber = '314719279';
-- SELECT COUNT(*) FROM extracted_document WHERE business_number = '314719279';
-- SELECT COUNT(*) FROM supplier WHERE businessNumber = '314719279' AND userId = 'CY2jmdBQ4AYH70BZARRp28j0GIi1';
-- SELECT COUNT(*) FROM classified_transactions WHERE businessNumber = '314719279' AND userId = 'CY2jmdBQ4AYH70BZARRp28j0GIi1';
-- SELECT COUNT(*) FROM user_category WHERE businessNumber = '314719279' AND firebaseId = 'CY2jmdBQ4AYH70BZARRp28j0GIi1';
-- SELECT COUNT(*) FROM user_sub_category WHERE businessNumber = '314719279' AND firebaseId = 'CY2jmdBQ4AYH70BZARRp28j0GIi1';
-- SELECT COUNT(*) FROM bill WHERE businessNumber = '314719279' AND userId = 'CY2jmdBQ4AYH70BZARRp28j0GIi1';
-- SELECT COUNT(*) FROM accountant_task WHERE businessNumber = '314719279';
-- SELECT COUNT(*) FROM report_workflow WHERE businessNumber = '314719279';
-- SELECT COUNT(*) FROM delegation WHERE userId = 'CY2jmdBQ4AYH70BZARRp28j0GIi1';
-- SELECT COUNT(*) FROM annual_report WHERE businessNumber = '314719279';
-- SELECT COUNT(*) FROM slim_transactions WHERE businessNumber = '314719279';
-- SELECT COUNT(*) FROM full_transactions_cache WHERE businessNumber = '314719279';

DELETE FROM `business` WHERE `id` = 12;

ALTER TABLE `business`
  ADD CONSTRAINT `uq_business_businessNumber`
  UNIQUE (`businessNumber`);

-- Verification (run after applying, expect 0 rows):
-- SELECT businessNumber, COUNT(*) c FROM business GROUP BY businessNumber HAVING c > 1;
