-- ============================================================================
-- Phase 3.5 — real FK constraint on expense.subCategoryId (D6 explicitly
-- calls this one out as "real DB constraint", unlike the display-only
-- subCategoryId pointers on supplier/classified_transactions/
-- extracted_document, which stay plain nullable ints with no enforced FK —
-- same no-real-FK precedent already established for sub_category's own
-- categoryId/accountId pointers).
--
-- Run ONLY after 2026-07-13_phase3_backfill.ts MODE=apply has completed and
-- verified 0 NULL expense.subCategoryId rows (confirmed: 85/85 backfilled,
-- see docs/redesign/orphan-resolution.md).
--
-- ON DELETE SET NULL: sub_category rows are soft-deleted (isActive=false)
-- in normal operation (CatalogService.deleteSubCategory) — a hard delete is
-- not a designed path, but SET NULL is the safe choice if one ever happens,
-- consistent with this FK being a referential-integrity guard, not a
-- cascade-delete mechanism (an expense must never disappear because a
-- catalog row was removed).
-- ============================================================================

ALTER TABLE `expense`
  ADD CONSTRAINT `fk_expense_sub_category`
    FOREIGN KEY (`subCategoryId`) REFERENCES `sub_category` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Verification (run after applying, expect the constraint listed):
--   SHOW CREATE TABLE expense;
--   SELECT COUNT(*) FROM expense WHERE subCategoryId IS NOT NULL AND subCategoryId NOT IN (SELECT id FROM sub_category); -- expect 0 (would have blocked the ALTER anyway)
