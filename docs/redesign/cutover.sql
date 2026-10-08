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
-- Superseded by the actual Session 8 investigation and moved to the end of
-- this file under "PHASE 0.3 / D12.4 - UNIQUE(businessNumber) on business
-- (Session 8)" — see that section for the real decision (delete id=5, not
-- id=12; index named `ux_business_number`, matching business.entity.ts).
-- This placeholder previously staged the wrong id and a differently-named
-- constraint from before the D12.4 investigation happened; removed
-- 2026-07-13 so a full run of this file doesn't delete BOTH business rows
-- under 314719279 (Section 2's DELETE id=12 followed by the end section's
-- guarded DELETE id=5, which still matches after Section 2 runs).
-- ============================================================================


-- ============================================================================
-- SECTION 3 (Phase 1.4) — chart renumbering: new accounting_section/
-- booking_account/account_code_migration tables, the new 16-section/59-account
-- chart seeded from chart.seed.ts, and the renumbering of the 9 old account
-- codes with live journal_line/journal_entry data (D14), including the
-- D14/D15-approved special case (business 204245724's six מקדמות ביטוח לאומי
-- journal lines -> the new 90300 technical account, not the generic
-- 5000->60000 mapping — see intentional-diffs.md Correction #1).
--
-- Full script: backend/scripts/migrations/2026-07-10_chart_renumber.sql
-- (embedded verbatim below — this file stays the single cumulative source of
-- truth per the plan's execution rules). Seed rows generated verbatim from
-- chart.seed.ts via backend/scripts/migrations/2026-07-10_generate-chart-seed-sql.ts
-- — do not hand-edit the INSERT blocks below without regenerating.
--
-- Rehearsed against keepintax_prodcopy on 2026-07-10, from a FRESH re-import
-- of _prod_dump/keepintax-prod.sql (matches the cutover checklist's "final
-- rehearsal must run the exact file that will run in production"). Verified
-- clean:
--   - Before: 12 distinct accountCode values in journal_line (302 rows);
--     account 5000 = exactly 6 rows, all 6 = the registered Bituach Leumi
--     journal_entry ids (10000145/158/167/173/186/203); grand totals
--     debit=322369.66, credit=323869.66, amountForTax=274247.09.
--   - After: old codes (4000,5000,5100,5200,5300,5400,5600,5700,6100) ABSENT;
--     new codes' per-code sums match the old codes' pre-migration sums
--     exactly; all 6 Bituach Leumi rows read 90300; account 5000 has 0 rows
--     remaining; grand totals UNCHANGED (debit=322369.66, credit=323869.66,
--     amountForTax=274247.09) — renumbering never touched money.
--   - accounting_section = 16 rows, booking_account = 59 rows,
--     account_code_migration = 50 rows.
--   - 0 orphaned journal_line.accountCode values (every code resolves to a
--     real booking_account row).
--   - journal_entry.counterAccountCode was '1100' on all 122 rows both
--     before and after — the generic renumbering UPDATE against it is a
--     verified no-op on this data (kept per D14, guards future/other data).
-- ============================================================================

-- ============================================================================
-- Migration: chart_renumber (Phase 1.4 — categories/accounting redesign)
-- Date: 2026-07-10
-- Scope: create accounting_section / account_code_migration, rename+extend
--        default_booking_account -> booking_account, seed the new 16-section/
--        59-account chart from chart.seed.ts, then renumber the 9 old account
--        codes with live journal_line/journal_entry data (D14), including the
--        D14/D15-approved special case: business 204245724's six Bituach-Leumi
--        journal lines move to the new 90300 technical account instead of the
--        generic 5000->60000 mapping (see intentional-diffs.md Correction #1).
--
-- Target at cutover time: production `keepintax-prod`.
-- Rehearsed against: local `keepintax_prodcopy`
-- (restored from _prod_dump/keepintax-prod.sql).
--
-- *** TRANSACTION SAFETY NOTE ***
-- MySQL DDL (CREATE TABLE / ALTER TABLE / RENAME TABLE / TRUNCATE, and the
-- dynamic PREPARE/EXECUTE index-drop block) each cause an implicit COMMIT —
-- Sections A and B below are NOT transactional, regardless of any
-- START TRANSACTION wrapping. If the script fails partway through Section A
-- or B, the recovery path is restoring from backup (or re-importing the dump
-- on keepintax_prodcopy), NOT a ROLLBACK — there is nothing to roll back.
-- Section C and D (the data UPDATEs against live journal_line/journal_entry)
-- run no DDL and ARE wrapped in a real START TRANSACTION / COMMIT, so a
-- failure there rolls back cleanly.
-- Run section by section in phpMyAdmin, checking each section's verification
-- SELECTs before continuing (per the plan's cutover checklist).
-- ============================================================================


-- ============================================================================
-- PRE-FLIGHT VERIFICATION (run manually, review output, before Section A)
-- ============================================================================
-- Baseline account-code distribution + money totals. Amounts must be
-- byte-identical after the whole script runs — renumbering only ever
-- rewrites account codes, never touches debit/credit/amountForTax.
-- SELECT accountCode, COUNT(*) c, SUM(debit) d, SUM(credit) cr, SUM(amountForTax) aft
--   FROM journal_line GROUP BY accountCode ORDER BY accountCode;
--
-- SELECT SUM(debit) d, SUM(credit) cr, SUM(amountForTax) aft FROM journal_line;
--
-- Confirms the 6 target Bituach Leumi entries and their business (D15).
-- SELECT id, issuerBusinessNumber, description FROM journal_entry
--   WHERE id IN (10000145,10000158,10000167,10000173,10000186,10000203);
--
-- Must equal exactly 6 — the D14 premise the whole special-case rests on.
-- SELECT COUNT(*) FROM journal_line WHERE accountCode='5000';
--
-- GUARD — must be 0. If this returns any rows, the "all live account-5000
-- usage IS the Bituach Leumi case" premise no longer holds: STOP, do not run
-- Section C/D, re-investigate (plan rule 5).
-- SELECT COUNT(*) FROM journal_line jl JOIN journal_entry je ON je.id = jl.journalEntryId
--   WHERE jl.accountCode='5000'
--   AND je.id NOT IN (10000145,10000158,10000167,10000173,10000186,10000203);
--
-- Pre-migration table state.
-- SELECT COUNT(*) FROM default_booking_account;
-- SHOW TABLES LIKE '%booking_account%';
-- ============================================================================


-- ============================================================================
-- SECTION A (NOT transactional — DDL auto-commits) — new tables + extend
-- booking_account
-- ============================================================================

CREATE TABLE `accounting_section` (
  `id`              INT           NOT NULL AUTO_INCREMENT,
  `code`            VARCHAR(255)  NOT NULL,
  `name`            VARCHAR(255)  NOT NULL,
  `ownerType`       ENUM('SYSTEM','ACCOUNTANT','CLIENT') NOT NULL DEFAULT 'SYSTEM',
  `chartOwnerKey`   VARCHAR(255)  NOT NULL DEFAULT 'SYSTEM',
  `accountantId`    VARCHAR(255)  NULL     DEFAULT NULL,
  `userId`          VARCHAR(255)  NULL     DEFAULT NULL,
  `businessNumber`  VARCHAR(255)  NULL     DEFAULT NULL,
  `visibilityScope` ENUM('SYSTEM_DEFAULT','ALL_ACCOUNTANT_CLIENTS','SPECIFIC_CLIENT') NULL DEFAULT NULL,
  `displayOrder`    INT           NULL     DEFAULT NULL,
  `isActive`        TINYINT(1)    NOT NULL DEFAULT 1,
  `createdAt`       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_accounting_section_owner_code` (`chartOwnerKey`, `code`)
-- Collation matches the DB's actual standard (MySQL 8 default), verified via
-- information_schema.TABLES against every existing table (journal_line,
-- journal_entry, booking_account, default_sub_category all utf8mb4_0900_ai_ci)
-- — utf8mb4_unicode_ci would collide with existing-table joins/subqueries.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `account_code_migration` (
  `id`        INT          NOT NULL AUTO_INCREMENT,
  `oldCode`   VARCHAR(255) NOT NULL,
  `newCode`   VARCHAR(255) NOT NULL,
  `source`    ENUM('accountCode','subAccountCode') NOT NULL,
  `createdAt` DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_account_code_migration_oldCode` (`oldCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Rename the D1.2 renamed entity's table (DefaultBookingAccount/
-- default_booking_account -> BookingAccount/booking_account).
RENAME TABLE `default_booking_account` TO `booking_account`;

-- Extend with the D1/D5-revised "card carries the full accounting law" columns.
ALTER TABLE `booking_account`
  ADD COLUMN `sectionId`        INT           NULL     DEFAULT NULL AFTER `displayOrder`,
  ADD COLUMN `code6111`         VARCHAR(255)  NULL     DEFAULT NULL AFTER `sectionId`,
  ADD COLUMN `vatPercent`       DECIMAL(5,2)  NULL     DEFAULT NULL AFTER `code6111`,
  ADD COLUMN `taxPercent`       DECIMAL(5,2)  NULL     DEFAULT NULL AFTER `vatPercent`,
  ADD COLUMN `reductionPercent` DECIMAL(5,2)  NULL     DEFAULT NULL AFTER `taxPercent`,
  ADD COLUMN `isEquipment`      TINYINT(1)    NULL     DEFAULT NULL AFTER `reductionPercent`,
  ADD COLUMN `recognitionType`  ENUM('RECOGNIZED','NOT_RECOGNIZED','NOT_APPLICABLE') NULL DEFAULT NULL AFTER `isEquipment`,
  ADD COLUMN `reportScope`      ENUM('pnl','annual','technical') NOT NULL DEFAULT 'pnl' AFTER `recognitionType`,
  ADD COLUMN `ownerType`        ENUM('SYSTEM','ACCOUNTANT','CLIENT') NOT NULL DEFAULT 'SYSTEM' AFTER `reportScope`,
  ADD COLUMN `chartOwnerKey`    VARCHAR(255)  NOT NULL DEFAULT 'SYSTEM' AFTER `ownerType`,
  ADD COLUMN `accountantId`     VARCHAR(255)  NULL     DEFAULT NULL AFTER `chartOwnerKey`,
  ADD COLUMN `userId`           VARCHAR(255)  NULL     DEFAULT NULL AFTER `accountantId`,
  ADD COLUMN `businessNumber`   VARCHAR(255)  NULL     DEFAULT NULL AFTER `userId`,
  ADD COLUMN `visibilityScope`  ENUM('SYSTEM_DEFAULT','ALL_ACCOUNTANT_CLIENTS','SPECIFIC_CLIENT') NULL DEFAULT NULL AFTER `businessNumber`,
  ADD COLUMN `isActive`         TINYINT(1)    NOT NULL DEFAULT 1 AFTER `visibilityScope`;

-- Drop the old bare UNIQUE(code) index. The pre-rename entity declared it via
-- `@Column({ unique: true })` (no literal name), so TypeORM auto-generated an
-- `IDX_<hash>` name we can't hardcode — look it up, then drop it by name.
SET @old_unique_idx := (
  SELECT INDEX_NAME FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_account'
    AND COLUMN_NAME = 'code' AND NON_UNIQUE = 0 AND SEQ_IN_INDEX = 1
    AND INDEX_NAME <> 'PRIMARY'
  LIMIT 1
);
SET @drop_idx_sql := CONCAT('ALTER TABLE `booking_account` DROP INDEX `', @old_unique_idx, '`');
PREPARE stmt FROM @drop_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `booking_account`
  ADD UNIQUE KEY `uq_booking_account_owner_code` (`chartOwnerKey`, `code`);

-- The old chart (1000-6300, ~30 rows, DEFAULT_ACCOUNTS from account.seed.ts)
-- is structurally superseded by the new 59-row chart (merges, new codes, new
-- law columns) — there is no 1:1 row correspondence to UPDATE in place, so we
-- replace wholesale. No FK references booking_account.id anywhere in the
-- schema (verified against every entity in backend/src), so this is safe.
TRUNCATE TABLE `booking_account`;


-- ============================================================================
-- SECTION B (NOT transactional — follows Section A's DDL, see note above) —
-- seed the new chart. Generated verbatim from chart.seed.ts's
-- ACCOUNTING_SECTIONS / CHART_ACCOUNTS / ACCOUNT_CODE_MIGRATION exports via
-- backend/scripts/migrations/2026-07-10_generate-chart-seed-sql.ts — do not
-- hand-edit below without regenerating, to avoid drift from the
-- already-reviewed-and-approved chart (docs/redesign/phase1-chart-review.md).
-- ============================================================================

-- accounting_section (16 rows) --
INSERT INTO `accounting_section`
  (`code`, `name`, `ownerType`, `chartOwnerKey`, `accountantId`, `userId`, `businessNumber`, `visibilityScope`, `displayOrder`, `isActive`)
VALUES
  ('40000', 'הכנסות', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1),
  ('40010', 'הכנסות פטורות', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 2, 1),
  ('60100', 'הוצאות משרד', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 3, 1),
  ('60200', 'רכב ותחבורה', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 4, 1),
  ('60300', 'תקשורת', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 5, 1),
  ('60400', 'תוכנות ושירותי ענן', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 6, 1),
  ('60500', 'שיווק ופרסום', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 7, 1),
  ('60600', 'ייעוץ ושירותים מקצועיים', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 8, 1),
  ('60700', 'הנהלת חשבונות', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 9, 1),
  ('60800', 'שכר', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 10, 1),
  ('60900', 'ספרות מקצועית', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 11, 1),
  ('61000', 'כיבוד', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 12, 1),
  ('61100', 'עמלות ודמי כרטיס', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 13, 1),
  ('60000', 'הוצאות בלתי מזוהות', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 14, 1),
  ('61200', 'הוצאות מימון', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 15, 1),
  ('61300', 'פחת', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 16, 1);

-- booking_account (59 rows, unchanged count — 90500/90600 and the 5 new
-- §3f ANNUAL cards are NOT here; they're added in Section 4b below with
-- explicit ids, alongside the existing 90500/90600 insert, to avoid
-- colliding with Section 4b's sub_category rows that already reference
-- those ids literally) — sectionId resolved by subquery on the
-- just-inserted sections. Every row below carries `reportScope` explicitly
-- (added 2026-07-14 model change, see phase1-chart-review.md §3e/§5):
-- 'pnl' default, 'technical' on the 90100-90400 rows. `recognitionType` on
-- those same rows changed from NULL to 'NOT_APPLICABLE' in the same pass
-- (it predates the enum's third value) --
INSERT INTO `booking_account`
  (`code`, `name`, `type`, `pnlCategory`, `displayOrder`, `sectionId`, `code6111`, `vatPercent`, `taxPercent`, `reductionPercent`, `isEquipment`, `recognitionType`, `reportScope`, `ownerType`, `chartOwnerKey`, `accountantId`, `userId`, `businessNumber`, `visibilityScope`, `isActive`)
VALUES
  ('1000', 'חשבון מעבר', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('1100', 'בנק', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('1110', 'מזומן', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('1120', 'כרטיס אשראי / סליקה', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('1200', 'לקוחות כלליים', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('2000', 'ספקים כלליים', 'liability', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('2100', 'כרטיסי אשראי לתשלום', 'liability', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('2400', 'מע"מ עסקאות', 'liability', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('2410', 'מע"מ תשומות', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('40000', 'הכנסות', 'income', 'הכנסות', 1, (SELECT id FROM `accounting_section` WHERE `code` = '40000' AND `chartOwnerKey` = 'SYSTEM'), NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('40010', 'הכנסות פטורות', 'income', 'הכנסות פטורות', 2, (SELECT id FROM `accounting_section` WHERE `code` = '40010' AND `chartOwnerKey` = 'SYSTEM'), NULL, NULL, NULL, NULL, NULL, NULL, 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60000', 'הוצאות לא מוכרות', 'expense', 'הוצאות בלתי מזוהות', 14, (SELECT id FROM `accounting_section` WHERE `code` = '60000' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 0, 0, 0, 'NOT_RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60010', 'ספקים — כללי (הוצאה מוכרת)', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60000' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60100', 'הוצאות משרד', 'expense', 'הוצאות משרד', 3, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60200', 'רכב ותחבורה', 'expense', 'רכב ותחבורה', 4, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60300', 'תקשורת', 'expense', 'תקשורת', 5, (SELECT id FROM `accounting_section` WHERE `code` = '60300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 25, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60400', 'תוכנות ושירותי ענן', 'expense', 'תוכנות ושירותי ענן', 6, (SELECT id FROM `accounting_section` WHERE `code` = '60400' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60500', 'שיווק ופרסום', 'expense', 'שיווק ופרסום', 7, (SELECT id FROM `accounting_section` WHERE `code` = '60500' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60600', 'ייעוץ ושירותים מקצועיים', 'expense', 'ייעוץ ושירותים מקצועיים', 8, (SELECT id FROM `accounting_section` WHERE `code` = '60600' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60700', 'הנהלת חשבונות', 'expense', 'הנהלת חשבונות', 9, (SELECT id FROM `accounting_section` WHERE `code` = '60700' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60800', 'שכר', 'expense', 'שכר', 10, (SELECT id FROM `accounting_section` WHERE `code` = '60800' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60900', 'ספרות מקצועית', 'expense', 'ספרות מקצועית', 11, (SELECT id FROM `accounting_section` WHERE `code` = '60900' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61000', 'כיבוד', 'expense', 'כיבוד', 12, (SELECT id FROM `accounting_section` WHERE `code` = '61000' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 80, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61010', 'מתנות מוכרות', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61000' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61100', 'עמלות ודמי כרטיס', 'expense', 'עמלות ודמי כרטיס', 13, (SELECT id FROM `accounting_section` WHERE `code` = '61100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61200', 'הוצאות מימון', 'expense', 'הוצאות מימון', 15, (SELECT id FROM `accounting_section` WHERE `code` = '61200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61300', 'פחת', 'expense', 'פחת', 16, (SELECT id FROM `accounting_section` WHERE `code` = '61300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 0, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60110', 'ארנונה', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60120', 'גז', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60130', 'ועד בית', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60140', 'חשמל', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60150', 'מים', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60160', 'תחזוקה', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60170', 'שכירות משרד', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60180', 'שליחויות', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60210', 'ביטוח רכב', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 45, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60220', 'דלק', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60230', 'חניה', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60240', 'טיפולים', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60250', 'כבישי אגרה', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60260', 'מערכות', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60270', 'תחבורה ציבורית', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60310', 'אינטרנט', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 25, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60320', 'טלפון קווי', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 25, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60330', 'פלאפון', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 25, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60410', 'תוכנות', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60400' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60610', 'ייעוץ והשתלמויות', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60600' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60620', 'ייעוץ מקצועי', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60600' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60810', 'הוצאות שכר', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60800' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61110', 'עמלות ודמי כרטיס (עסק)', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61120', 'עמלות ודמי כרטיס (בנק, אשראי ותנועות)', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61210', 'ריבית', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61310', 'מחשב', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 0, 33.33, 1, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61320', 'ריהוט', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 0, 7, 1, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61330', 'רכב', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 0, 15, 1, 'RECOGNIZED', 'pnl', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('90100', 'מקדמות מס הכנסה', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOT_APPLICABLE', 'technical', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('90200', 'גביית מע"מ', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOT_APPLICABLE', 'technical', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('90300', 'מקדמות ביטוח לאומי', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOT_APPLICABLE', 'technical', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('90400', 'מס במקור שנוכה מלקוחות', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOT_APPLICABLE', 'technical', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1);

-- account_code_migration (50 rows) --
INSERT INTO `account_code_migration` (`oldCode`, `newCode`, `source`)
VALUES
  ('4000', '40000', 'accountCode'),
  ('4010', '40010', 'accountCode'),
  ('5000', '60000', 'accountCode'),
  ('5100', '60100', 'accountCode'),
  ('5200', '60200', 'accountCode'),
  ('5300', '60300', 'accountCode'),
  ('5400', '60400', 'accountCode'),
  ('5500', '60500', 'accountCode'),
  ('5600', '60600', 'accountCode'),
  ('5700', '60700', 'accountCode'),
  ('5800', '60800', 'accountCode'),
  ('5900', '60900', 'accountCode'),
  ('6000', '61000', 'accountCode'),
  ('6100', '61100', 'accountCode'),
  ('6200', '61200', 'accountCode'),
  ('6300', '61300', 'accountCode'),
  ('5101', '60110', 'subAccountCode'),
  ('5102', '60120', 'subAccountCode'),
  ('5104', '60130', 'subAccountCode'),
  ('5105', '60140', 'subAccountCode'),
  ('5106', '60150', 'subAccountCode'),
  ('5110', '60160', 'subAccountCode'),
  ('5108', '60170', 'subAccountCode'),
  ('5109', '60180', 'subAccountCode'),
  ('5201', '60210', 'subAccountCode'),
  ('5202', '60220', 'subAccountCode'),
  ('5203', '60230', 'subAccountCode'),
  ('5204', '60240', 'subAccountCode'),
  ('5205', '60250', 'subAccountCode'),
  ('5206', '60260', 'subAccountCode'),
  ('5207', '60270', 'subAccountCode'),
  ('5301', '60310', 'subAccountCode'),
  ('5302', '60320', 'subAccountCode'),
  ('5303', '60330', 'subAccountCode'),
  ('5401', '60410', 'subAccountCode'),
  ('5601', '60610', 'subAccountCode'),
  ('5602', '60620', 'subAccountCode'),
  ('5801', '60810', 'subAccountCode'),
  ('6101', '61110', 'subAccountCode'),
  ('6102', '61120', 'subAccountCode'),
  ('6201', '61210', 'subAccountCode'),
  ('6301', '61310', 'subAccountCode'),
  ('6302', '61320', 'subAccountCode'),
  ('6303', '61330', 'subAccountCode'),
  ('5103', '60100', 'subAccountCode'),
  ('5107', '60000', 'subAccountCode'),
  ('5501', '60500', 'subAccountCode'),
  ('5701', '60700', 'subAccountCode'),
  ('5901', '60900', 'subAccountCode'),
  ('6001', '61000', 'subAccountCode');


-- ============================================================================
-- SECTION C+D — data renumbering, wrapped in a real transaction (no DDL
-- below this point, so this one actually rolls back cleanly on failure).
-- ============================================================================

START TRANSACTION;

-- SECTION C — D14/D15 special case: business 204245724's six מקדמות ביטוח
-- לאומי journal lines (currently on account 5000) move to the 90300 technical
-- account, NOT the generic 60000 mapping (intentional-diffs.md Correction #1).
-- Double-filtered (journalEntryId list AND accountCode='5000') so this can
-- never accidentally touch an unrelated row.
UPDATE `journal_line`
SET `accountCode` = '90300'
WHERE `accountCode` = '5000'
  AND `journalEntryId` IN (10000145, 10000158, 10000167, 10000173, 10000186, 10000203);

-- SECTION D — generic renumbering via the migration map for the remaining 8
-- live codes (5000's generic 60000 mapping now matches 0 rows, since Section
-- C already moved all of account 5000's live usage to 90300 — this is by
-- design, not a bug; kept so the code path guards any future/other data on
-- 5000, per D14).
UPDATE `journal_line` jl
JOIN `account_code_migration` m ON m.`oldCode` = jl.`accountCode`
SET jl.`accountCode` = m.`newCode`;

UPDATE `journal_entry` je
JOIN `account_code_migration` m ON m.`oldCode` = je.`counterAccountCode`
SET je.`counterAccountCode` = m.`newCode`;

COMMIT;


-- ============================================================================
-- POST-MIGRATION VERIFICATION (run manually, review output)
-- ============================================================================
-- Old codes (4000,5000,5100,5200,5300,5400,5600,5700,6100) must be ABSENT;
-- sums per new code must equal the old code's pre-migration sums exactly
-- (except 5000, which splits entirely into 90300 — nothing remains on 60000).
-- SELECT accountCode, COUNT(*) c, SUM(debit) d, SUM(credit) cr, SUM(amountForTax) aft
--   FROM journal_line GROUP BY accountCode ORDER BY accountCode;
--
-- Grand totals must match the PRE-FLIGHT totals exactly — renumbering never
-- touches money.
-- SELECT SUM(debit) d, SUM(credit) cr, SUM(amountForTax) aft FROM journal_line;
--
-- All 6 rows must now read 90300.
-- SELECT accountCode FROM journal_line
--   WHERE journalEntryId IN (10000145,10000158,10000167,10000173,10000186,10000203);
--
-- Expect 16 / 59 / 50.
-- SELECT COUNT(*) FROM accounting_section;
-- SELECT COUNT(*) FROM booking_account;
-- SELECT COUNT(*) FROM account_code_migration;
--
-- Every posted code now resolves to a real chart row — expect 0.
-- SELECT COUNT(*) FROM journal_line WHERE accountCode NOT IN (SELECT code FROM booking_account);
-- ============================================================================


-- ============================================================================
-- SECTION 4 (Phase 2.1/2.2) — category/sub_category tables + catalog data
-- migration.
--
-- SECTION 4a below is the schema DDL (NOT transactional — MySQL DDL
-- auto-commits), embedded verbatim from
-- backend/scripts/migrations/2026-07-12_catalog_migration_schema.sql — do
-- not hand-edit here without regenerating from that file. Verified
-- column-for-column against backend/src/bookkeeping/category.entity.ts and
-- sub-category.entity.ts (2026-07-12).
--
-- SECTION 4b (the category/sub_category/booking_account DATA — a real
-- transaction) is appended separately once
-- backend/scripts/migrations/2026-07-12_catalog_migration.ts's MODE=apply
-- has actually run and its results are read back — see that section for
-- why (variant-card codes are allocated dynamically, not statically
-- derivable like Phase 1's chart).
-- ============================================================================

-- ============================================================================
-- SECTION 4a (NOT transactional — DDL auto-commits)
-- ============================================================================

CREATE TABLE `category` (
  `id`                     INT           NOT NULL AUTO_INCREMENT,
  `name`                   VARCHAR(255)  NOT NULL,
  `type`                   ENUM('EXPENSE','INCOME') NOT NULL,
  `defaultRecognitionType` ENUM('RECOGNIZED','NOT_RECOGNIZED') NULL DEFAULT NULL,
  `ownerType`              ENUM('SYSTEM','ACCOUNTANT','CLIENT') NOT NULL DEFAULT 'SYSTEM',
  `chartOwnerKey`          VARCHAR(255)  NOT NULL DEFAULT 'SYSTEM',
  `accountantId`           VARCHAR(255)  NULL     DEFAULT NULL,
  `userId`                 VARCHAR(255)  NULL     DEFAULT NULL,
  `businessNumber`         VARCHAR(255)  NULL     DEFAULT NULL,
  `visibilityScope`        ENUM('SYSTEM_DEFAULT','ALL_ACCOUNTANT_CLIENTS','SPECIFIC_CLIENT') NULL DEFAULT NULL,
  `isDefault`              TINYINT(1)    NOT NULL DEFAULT 0,
  `isActive`               TINYINT(1)    NOT NULL DEFAULT 1,
  `createdByUserId`        VARCHAR(255)  NULL     DEFAULT NULL,
  `createdAt`              DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`              DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_category_owner_name_type` (`chartOwnerKey`, `name`, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sub_category` (
  `id`                INT           NOT NULL AUTO_INCREMENT,
  `categoryId`        INT           NOT NULL,
  `name`              VARCHAR(255)  NOT NULL,
  `isPrivate`         TINYINT(1)    NOT NULL DEFAULT 0,
  `accountId`         INT           NULL     DEFAULT NULL,
  `necessity`         ENUM('MANDATORY','IMPORTANT','OPTIONAL') NOT NULL DEFAULT 'IMPORTANT',
  `ownerType`         ENUM('SYSTEM','ACCOUNTANT','CLIENT') NOT NULL DEFAULT 'SYSTEM',
  `chartOwnerKey`     VARCHAR(255)  NOT NULL DEFAULT 'SYSTEM',
  `accountantId`      VARCHAR(255)  NULL     DEFAULT NULL,
  `userId`            VARCHAR(255)  NULL     DEFAULT NULL,
  `businessNumber`    VARCHAR(255)  NULL     DEFAULT NULL,
  `visibilityScope`   ENUM('SYSTEM_DEFAULT','ALL_ACCOUNTANT_CLIENTS','SPECIFIC_CLIENT') NULL DEFAULT NULL,
  `approvalStatus`    ENUM('APPROVED','PENDING_ACCOUNTANT_APPROVAL','MISSING_ACCOUNTING_MAPPING','REJECTED') NOT NULL DEFAULT 'APPROVED',
  `approvedByUserId`  VARCHAR(255)  NULL     DEFAULT NULL,
  `approvedAt`        DATETIME      NULL     DEFAULT NULL,
  `rejectedByUserId`  VARCHAR(255)  NULL     DEFAULT NULL,
  `rejectedAt`        DATETIME      NULL     DEFAULT NULL,
  `rejectionReason`   TEXT          NULL     DEFAULT NULL,
  `isDefault`         TINYINT(1)    NOT NULL DEFAULT 0,
  `isActive`          TINYINT(1)    NOT NULL DEFAULT 1,
  `createdByUserId`   VARCHAR(255)  NULL     DEFAULT NULL,
  `createdAt`         DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`         DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sub_category_owner_category_name` (`chartOwnerKey`, `categoryId`, `name`),
  KEY `idx_sub_category_categoryId` (`categoryId`),
  KEY `idx_sub_category_accountId` (`accountId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Verification (run after applying, expect both to exist with 0 rows):
-- SHOW COLUMNS FROM `category`;
-- SHOW COLUMNS FROM `sub_category`;
-- SELECT COUNT(*) FROM `category`;
-- SELECT COUNT(*) FROM `sub_category`;

-- ============================================================================
-- SECTION 4b — category/sub_category/booking_account DATA, wrapped in a real
-- transaction (no DDL). Embedded verbatim from the readback of an actual
-- MODE=apply run of 2026-07-12_catalog_migration.ts against
-- keepintax_prodcopy (2026-07-12), generated by
-- backend/scripts/migrations/2026-07-12_generate-catalog-migration-sql.ts —
-- do not hand-edit without regenerating. Explicit `id` values are included
-- (this DB's tables were empty at insert time; AUTO_INCREMENT will need
-- resetting or the ids re-verified free before running against a DB where
-- these tables already have rows — not the case for a fresh production
-- cutover run against empty category/sub_category tables).
--
-- Passed full verification (backend/scripts/verify-phase2-catalog-migration.ts,
-- 2026-07-12): 14 category / 96 sub_category / 2 new booking_account rows;
-- zero duplicate rows under either UNIQUE constraint; zero orphaned
-- sub_category.accountId references; zero PRIVATE rows carrying an
-- accountId; and the resolution-parity hard gate — 21 of 22 distinct
-- (category,subCategory,firebaseId,businessNumber) pairs referenced by the
-- 85 live `expense` rows resolve identically through CatalogService as
-- through the old resolver mapped via account_code_migration (16 of those
-- are exact matches, the other 5 are Phase 1.3's intentional parent→child
-- refinements — e.g. "דלק" now resolves to the granular 60220 rather than
-- the old flat parent 60200, since subAccountCode never existed in
-- production to carry that distinction before); the 22nd pair (עסק/מקדמות
-- ביטוח לאומי, business 204245724) is the registered D14/D15 exception,
-- resolving to 90300 rather than the generic 60000 mapping, exactly as
-- required.
-- ============================================================================

START TRANSACTION;

-- booking_account (7 rows total): the original 2 this-session technical
-- accounts (90500/90600, Phase 2.2, explicit ids 62/63 that the
-- sub_category INSERT below already references) plus 5 new §3f ANNUAL
-- cards (added 2026-07-14, explicit ids 64-68 continuing the sequence).
-- `reportScope` column added and 90500/90600's `recognitionType` corrected
-- from NULL to 'NOT_APPLICABLE' in the same pass as Section B — see
-- phase1-chart-review.md §3e/§3f/§5. Codes/law for the 5 new rows match
-- chart.seed.ts's CHART_ACCOUNTS exactly: zero law, sectionId NULL,
-- allocated sequentially from the SYSTEM expense ceiling 61330. --
INSERT INTO `booking_account` (`id`, `code`, `name`, `type`, `pnlCategory`, `displayOrder`, `sectionId`, `code6111`, `vatPercent`, `taxPercent`, `reductionPercent`, `isEquipment`, `recognitionType`, `reportScope`, `ownerType`, `chartOwnerKey`, `accountantId`, `userId`, `businessNumber`, `visibilityScope`, `isActive`) VALUES
  (62, '90500', 'תנועות פנימיות בין חשבונות', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOT_APPLICABLE', 'technical', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  (63, '90600', 'פרעון הלוואות (קרן)', 'liability', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'NOT_APPLICABLE', 'technical', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  (64, '61340', 'תרומות מוכרות', 'expense', NULL, NULL, NULL, NULL, 0, 0, 0, 0, 'NOT_APPLICABLE', 'annual', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  (65, '61350', 'ביטוח חיים', 'expense', NULL, NULL, NULL, NULL, 0, 0, 0, 0, 'NOT_APPLICABLE', 'annual', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  (66, '61360', 'ביטוח אובדן כושר עבודה', 'expense', NULL, NULL, NULL, NULL, 0, 0, 0, 0, 'NOT_APPLICABLE', 'annual', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  (67, '61370', 'הפקדה לפנסיה', 'expense', NULL, NULL, NULL, NULL, 0, 0, 0, 0, 'NOT_APPLICABLE', 'annual', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  (68, '61380', 'הפקדה לקרן השתלמות', 'expense', NULL, NULL, NULL, NULL, 0, 0, 0, 0, 'NOT_APPLICABLE', 'annual', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1);

-- category (14 rows) --
INSERT INTO `category` (`id`, `name`, `type`, `defaultRecognitionType`, `ownerType`, `chartOwnerKey`, `accountantId`, `userId`, `businessNumber`, `visibilityScope`, `isDefault`, `isActive`, `createdByUserId`) VALUES
  (1, 'דיור והוצאות הבית', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (2, 'אוכל וצריכה שוטפת', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (3, 'רכב ותחבורה', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (4, 'קניות', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (5, 'ילדים ומשפחה', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (6, 'בריאות וביטוחים', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (7, 'פנאי וחופשות', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (8, 'עסק', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (9, 'בנק, אשראי ותנועות', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (10, 'החזרי מס ודוח שנתי', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (11, 'שונות', 'EXPENSE', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (12, 'הכנסות', 'INCOME', NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1, 1, NULL),
  (13, 'חומרי גלם וציוד לאפיה', 'EXPENSE', NULL, 'CLIENT', 'CLIENT_308360981', NULL, 'yzLUGK0UBTchyasx6WREYs7S0Ni1', '308360981', NULL, 0, 1, 'yzLUGK0UBTchyasx6WREYs7S0Ni1'),
  (14, 'חריגים', 'EXPENSE', NULL, 'CLIENT', 'CLIENT_204245724', NULL, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3', '204245724', NULL, 0, 1, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3');

-- sub_category (96 rows) — `reportScope` column removed 2026-07-14 (field
-- moved to booking_account, see phase1-chart-review.md §5); the 5 SYSTEM
-- ANNUAL rows (ids 51/52/73/74/75) now carry a real accountId (67/68/64/65/66,
-- the new §3f cards) instead of NULL, matching catalog.seed.ts's
-- SYSTEM_SUB_CATEGORIES (already updated) and CatalogService.createSubCategory
-- (ANNUAL is no longer special-cased to skip account resolution). Two
-- CLIENT-scoped rows (ids 90 "ביטוח חיים"/CLIENT_200866028, 92 "תרומה"/
-- CLIENT_200866028) are STILL accountId=NULL with no matching card — left
-- as-is deliberately, not touched by this pass: fixing them correctly would
-- mean allocating brand-new CLIENT-scoped cards (an actual code-allocation
-- decision), not a straight repoint at an existing SYSTEM card, so this is
-- flagged for Elazar rather than improvised (plan rule 5). --
INSERT INTO `sub_category` (`id`, `categoryId`, `name`, `isPrivate`, `accountId`, `necessity`, `ownerType`, `chartOwnerKey`, `accountantId`, `userId`, `businessNumber`, `visibilityScope`, `approvalStatus`, `approvedByUserId`, `approvedAt`, `rejectedByUserId`, `rejectedAt`, `rejectionReason`, `isDefault`, `isActive`, `createdByUserId`) VALUES
  (1, 1, 'שכירות', 0, 14, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (2, 1, 'משכנתא', 0, 14, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (3, 1, 'ארנונה', 0, 28, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (4, 1, 'ועד בית', 0, 30, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (5, 1, 'חשמל', 0, 31, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (6, 1, 'מים', 0, 32, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (7, 1, 'גז', 0, 29, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (8, 1, 'אינטרנט', 0, 43, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (9, 1, 'טלפון קווי', 0, 44, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (10, 1, 'תחזוקה', 0, 33, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (11, 1, 'גינה', 0, 14, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (12, 2, 'סופרמרקט', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (13, 2, 'משלוחים', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (14, 2, 'פארם', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (15, 3, 'דלק', 0, 37, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (16, 3, 'ביטוח רכב', 0, 36, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (17, 3, 'טיפולים', 0, 39, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (18, 3, 'חניה', 0, 38, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (19, 3, 'כבישי אגרה', 0, 40, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (20, 3, 'מערכות', 0, 41, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (21, 3, 'תחבורה ציבורית', 0, 42, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (22, 4, 'ביגוד', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (23, 4, 'אלקטרוניקה', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (24, 4, 'ריהוט', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (25, 4, 'מתנות', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (26, 4, 'כללי', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (27, 5, 'גן', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (28, 5, 'בית ספר', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (29, 5, 'חוגים', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (30, 5, 'בייביסיטר', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (31, 6, 'רופא', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (32, 6, 'תרופות', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (33, 6, 'בדיקות', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (34, 6, 'ביטוח בריאות', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (35, 7, 'מסעדות', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (36, 7, 'נופש', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (37, 7, 'ספורט', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (38, 7, 'בילויים', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (39, 8, 'הוצאות משרד', 0, 14, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (40, 8, 'תוכנות', 0, 46, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (41, 8, 'שיווק ופרסום', 0, 18, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (42, 8, 'הנהלת חשבונות', 0, 20, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (43, 8, 'רואה חשבון', 0, 20, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (44, 8, 'ספקים', 0, 12, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (45, 8, 'ייעוץ והשתלמויות', 0, 47, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (46, 8, 'ספרות מקצועית', 0, 22, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (47, 8, 'כיבוד', 0, 23, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (48, 8, 'מקדמות ביטוח לאומי', 0, 58, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (49, 8, 'מקדמות מס הכנסה', 0, 56, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (50, 8, 'גביית מע"מ', 0, 57, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (51, 10, 'הפקדה לפנסיה', 0, 67, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (52, 10, 'הפקדה לקרן השתלמות', 0, 68, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (53, 8, 'עמלות ודמי כרטיס', 0, 25, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (54, 8, 'הוצאות שכר', 0, 49, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (55, 9, 'ריבית', 0, 52, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (56, 9, 'עמלות ודמי כרטיס', 0, 25, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (57, 9, 'חיוב אשראי חודשי', 0, 62, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (58, 9, 'משיכת מזומן', 0, 62, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (59, 9, 'פרעון הלוואה', 0, 63, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (60, 9, 'בין חשבונותי', 0, 62, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (61, 9, 'ביט', 0, 62, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (62, 9, 'פייבוקס', 0, 62, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (63, 12, 'הכנסה עסקית', 0, 10, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (64, 12, 'משכורת', 0, 10, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (65, 12, 'זיכוי כרטיס אשראי', 0, 10, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (66, 12, 'מילואים', 0, 10, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (67, 12, 'דמי לידה', 0, 10, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (68, 12, 'אפליקציית תשלום', 0, 10, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (69, 1, 'פלאפון', 0, 45, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (70, 11, 'שונות', 0, 12, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (71, 5, 'מעון', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (72, 6, 'קופת חולים', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (73, 10, 'תרומות מוכרות', 0, 64, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (74, 10, 'ביטוח חיים', 0, 65, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (75, 10, 'ביטוח אובדן כושר עבודה', 0, 66, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (76, 7, 'ספרות וקריאה', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (77, 7, 'שירותי סטרימינג', 1, NULL, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (78, 12, 'קצבת ילדים', 0, 10, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (79, 8, 'שכירות משרד', 0, 34, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (80, 8, 'שליחויות', 0, 35, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (81, 8, 'ייעוץ מקצועי', 0, 48, 'IMPORTANT', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 1, 1, NULL),
  (82, 2, 'מכולת רמגש', 1, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_204245724', NULL, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3', '204245724', NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 0, 1, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3'),
  (83, 2, 'מכולת נוב', 1, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_204245724', NULL, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3', '204245724', NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 0, 1, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3'),
  (84, 2, 'בשרים', 1, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_204245724', NULL, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3', '204245724', NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 0, 1, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3'),
  (85, 2, 'איסוף עצמי', 1, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_308360981', NULL, 'yzLUGK0UBTchyasx6WREYs7S0Ni1', '308360981', NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 0, 1, 'yzLUGK0UBTchyasx6WREYs7S0Ni1'),
  (86, 13, 'קונדיטוריה', 0, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_308360981', NULL, 'yzLUGK0UBTchyasx6WREYs7S0Ni1', '308360981', NULL, 'MISSING_ACCOUNTING_MAPPING', NULL, NULL, NULL, NULL, NULL, 0, 1, 'yzLUGK0UBTchyasx6WREYs7S0Ni1'),
  (87, 1, 'מיסי ישוב', 0, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_204245724', NULL, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3', '204245724', NULL, 'MISSING_ACCOUNTING_MAPPING', NULL, NULL, NULL, NULL, NULL, 0, 1, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3'),
  (88, 7, 'אופנוע', 1, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_204245724', NULL, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3', '204245724', NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 0, 1, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3'),
  (89, 14, 'שיפוץ נוב', 0, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_204245724', NULL, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3', '204245724', NULL, 'MISSING_ACCOUNTING_MAPPING', NULL, NULL, NULL, NULL, NULL, 0, 1, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3'),
  (90, 6, 'ביטוח חיים', 0, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_200866028', NULL, 'AF9LT37vCLZZX7boMLUyFwYZ2u23', '200866028', NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 0, 1, 'AF9LT37vCLZZX7boMLUyFwYZ2u23'),
  (91, 1, 'מיסי ישוב ומים', 0, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_200866028', NULL, 'AF9LT37vCLZZX7boMLUyFwYZ2u23', '200866028', NULL, 'MISSING_ACCOUNTING_MAPPING', NULL, NULL, NULL, NULL, NULL, 0, 1, 'AF9LT37vCLZZX7boMLUyFwYZ2u23'),
  (92, 11, 'תרומה', 0, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_200866028', NULL, 'AF9LT37vCLZZX7boMLUyFwYZ2u23', '200866028', NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 0, 1, 'AF9LT37vCLZZX7boMLUyFwYZ2u23'),
  (93, 8, 'מקדמות ביטוח לאומי', 0, 58, 'IMPORTANT', 'CLIENT', 'CLIENT_204245724', NULL, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3', '204245724', NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 0, 1, 'JpIEJt3lSDMsI9uG67Etqx4ZbuC3'),
  (94, 2, 'משנת', 1, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_207550344', NULL, 'FVVORr3iRiPQYnpTmm0ODylzj2s1', '207550344', NULL, 'APPROVED', NULL, NULL, NULL, NULL, NULL, 0, 1, 'FVVORr3iRiPQYnpTmm0ODylzj2s1'),
  (95, 12, 'מלגה', 0, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_322253238', NULL, 'nVtdyGPipFXFgGr4Mp2wLfpW8Nw2', '322253238', NULL, 'MISSING_ACCOUNTING_MAPPING', NULL, NULL, NULL, NULL, NULL, 0, 1, 'nVtdyGPipFXFgGr4Mp2wLfpW8Nw2'),
  (96, 12, 'העברה בין חשבונות', 0, NULL, 'IMPORTANT', 'CLIENT', 'CLIENT_322253238', NULL, 'nVtdyGPipFXFgGr4Mp2wLfpW8Nw2', '322253238', NULL, 'MISSING_ACCOUNTING_MAPPING', NULL, NULL, NULL, NULL, NULL, 0, 1, 'nVtdyGPipFXFgGr4Mp2wLfpW8Nw2');

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION (run manually, review output)
-- ============================================================================
-- Expect 14 / 96 / 7.
-- SELECT COUNT(*) FROM category;
-- SELECT COUNT(*) FROM sub_category;
-- SELECT COUNT(*) FROM booking_account WHERE code IN ('90500','90600','61340','61350','61360','61370','61380');
--
-- Zero duplicates under either UNIQUE constraint.
-- SELECT chartOwnerKey, name, type, COUNT(*) c FROM category GROUP BY 1,2,3 HAVING c > 1;
-- SELECT chartOwnerKey, categoryId, name, COUNT(*) c FROM sub_category GROUP BY 1,2,3 HAVING c > 1;
--
-- Every accountId resolves to a real booking_account row — expect 0.
-- SELECT COUNT(*) FROM sub_category WHERE accountId IS NOT NULL AND accountId NOT IN (SELECT id FROM booking_account);
--
-- The 5 SYSTEM ANNUAL sub_categories now resolve to real §3f cards, not
-- accountId=NULL (2026-07-14 model change) — expect 5 rows, each with its
-- own distinct accountCode among 61340/61350/61360/61370/61380.
-- SELECT sc.name, ba.code FROM sub_category sc JOIN booking_account ba ON ba.id = sc.accountId
--   WHERE sc.chartOwnerKey = 'SYSTEM' AND ba.reportScope = 'annual' ORDER BY ba.code;
--
-- No PRIVATE row carries an accountId (D5) — expect 0.
-- SELECT COUNT(*) FROM sub_category WHERE isPrivate = 1 AND accountId IS NOT NULL;
--
-- Full resolution-parity re-run: backend/scripts/verify-phase2-catalog-migration.ts
-- ============================================================================


-- ============================================================================
-- SECTION 5 (Phase 2.6, D13) — flat catalog seeder reconciliation.
--
-- NO NEW SQL IN THIS SECTION. `CatalogSeedService` (backend/src/bookkeeping/
-- catalog-seed.service.ts, replacing AccountSeedService) seeds
-- accounting_section + booking_account from chart.seed.ts and the SYSTEM
-- category/sub_category catalog from catalog.seed.ts, on every backend boot
-- (idempotent: sections/accounts are find-or-create/update by
-- (chartOwnerKey, code); category/sub_category rows are create-if-missing
-- only, never touching an existing row).
--
-- Verified against `keepintax_prodcopy` (2026-07-12, MODE=review then
-- MODE=apply via backend/scripts/migrations/2026-07-12_run-catalog-seeder.ts):
-- running the seeder is a CONFIRMED NO-OP — every one of its 16 sections /
-- 61 accounts / 12 SYSTEM categories / 81 SYSTEM sub_categories already
-- matches, byte-for-byte, what Section 3 (Phase 1.4 chart renumber) and
-- Sections 4a/4b (Phase 2.2 catalog migration) above already wrote. This is
-- the intended relationship, not a coincidence: catalog.seed.ts's SYSTEM_
-- SUB_CATEGORIES array is a portable, name-keyed restatement of the exact
-- same reviewed data in docs/redesign/phase2-catalog-review.md that Section
-- 4b's literal INSERTs encode by id — two representations of one
-- Elazar-approved source, not two independent ones.
--
-- Cutover ordering implication (Elazar, Phase 2.4 plan review): Sections
-- 3/4a/4b MUST run (they create the rows) BEFORE the new backend code
-- (carrying CatalogSeedService) is deployed and boots — matching the
-- checklist's existing order (run cutover.sql fully, THEN deploy). Once
-- deployed, CatalogSeedService's own boot-time run reproduces the identical
-- no-op confirmed here, and continues to keep the catalog consistent on
-- every subsequent boot (e.g. after Phase 7 drops the old four tables and
-- AccountSeedService no longer exists to do this job).
--
-- If a future cutover rehearsal on a FRESH database shows this section is
-- NOT a no-op (report at
--   DB_DATABASE=<db> NODE_ENV=production SKIP_BOOT_SEED=true \
--     npx ts-node -r tsconfig-paths/register scripts/migrations/2026-07-12_run-catalog-seeder.ts
-- ), catalog.seed.ts has drifted from Sections 4a/4b — investigate before
-- trusting either one at cutover.
-- ============================================================================


-- ============================================================================
-- SECTION 6 (Phase 3) — FK backfill & expense snapshots (D6/D7/D8).
--
-- Rehearsed against `keepintax_prodcopy` on 2026-07-13 (fresh from the
-- Section 1-5 state, no incident this session). Order matters: 6a (schema)
-- MUST run before 6b (FK constraint — needs the column to exist) and 6c
-- (data — needs every column to exist); 6c MUST run before 6b at cutover
-- time too (the FK constraint would reject any pre-existing NULL row, but
-- since every expense.subCategoryId is backfilled non-NULL by 6c first,
-- ordering 6b after 6c is what was actually rehearsed and is what's
-- reproduced here).
--
-- Sub-sections:
--   6a — D6 schema: rename expense.taxPercent/vatPercent/isEquipment/
--        reductionPercent to their *Snapshot names (RENAME COLUMN,
--        preserves type/data, no copy needed per D6); add the FK/snapshot/
--        description/approval columns to expense; add subCategoryId to
--        supplier/classified_transactions/extracted_document (display-only,
--        no FK — same no-real-FK precedent as sub_category.categoryId/
--        accountId); add extracted_document.document_kind (D8).
--   6b — the one REAL DB constraint D6 calls out explicitly:
--        fk_expense_sub_category (expense.subCategoryId -> sub_category.id,
--        ON DELETE SET NULL — sub_category rows are soft-deleted in normal
--        operation, this is a guard against the unlikely hard-delete case,
--        not a cascade-delete mechanism).
--   6c — literal backfill data, generated by
--        backend/scripts/migrations/2026-07-13_generate-phase3-sql.ts
--        against keepintax_prodcopy post-apply (same "bake in the exact
--        values, don't re-resolve live at cutover time" precedent as
--        Section 4b): expense.subCategoryId/snapshot columns/description/
--        approvalStatus for all 85 rows (100% resolved — D14's "zero
--        orphans" held exactly, see docs/redesign/orphan-resolution.md);
--        journal_entry.description backfill (idempotent WHERE-guarded — 0
--        rows actually changed this run, every EXPENSE-referenced entry
--        already carried a non-empty description); supplier (11/11),
--        classified_transactions (195/196 — 1 legacy rule's category/
--        subCategory pair didn't resolve, left NULL, not a hard stop per
--        plan since these are display-only pointers), extracted_document
--        subCategoryId (33/33) + documentKind (33/33, all EXPENSE_INVOICE
--        — every OCR'd doc in this dataset is either already confirmed to
--        an Expense or a plain invoice/receipt/tax_invoice_receipt type).
--
-- CAUTION — id-drift risk (same known characteristic as Section 4b, not new
-- here): the subCategoryId values below are the sub_category.id's produced
-- by THIS rehearsal's Section 4b run. Section 4b already bakes in specific
-- literal ids too, so as long as cutover.sql's Sections 3/4a/4b/5/6 run
-- together in one pass against a fresh dump (as the cutover checklist
-- requires — "full rehearsal... run the complete cutover.sql on it
-- end-to-end"), the ids stay self-consistent. If Section 4b is ever
-- regenerated independently before cutover (e.g. because the catalog
-- changed), Section 6c MUST be regenerated too via
-- 2026-07-13_generate-phase3-sql.ts — do not hand-edit one without the
-- other.
--
-- Verification this session: backend/scripts/verify-phase3-backfill.ts
-- (all checks green) + a fresh generate-baseline-reports.ts +
-- compare-baseline-reports.ts run (zero un-registered diffs — Phase 3
-- touches no journal_entry/journal_line values, so this was expected, and
-- confirmed empirically rather than assumed).
-- ============================================================================

-- ---- 6a: schema (backend/scripts/migrations/2026-07-13_phase3_schema.sql) ----

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

-- ---- 6b: FK constraint (backend/scripts/migrations/2026-07-13_phase3_fk.sql) ----

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

-- ---- 6c: data backfill (backend/scripts/migrations/2026-07-13_phase3_data.sql) ----

START TRANSACTION;
-- Generated by backend/scripts/migrations/2026-07-13_generate-phase3-sql.ts
-- against keepintax_prodcopy, 2026-07-14T22:22:59.432Z

-- expense (85 rows)
UPDATE `expense` SET subCategoryId=15, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/דלק', approvalStatus='APPROVED' WHERE id=1;
UPDATE `expense` SET subCategoryId=15, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/דלק', approvalStatus='APPROVED' WHERE id=2;
UPDATE `expense` SET subCategoryId=93, sectionIdSnapshot=NULL, sectionCodeSnapshot=NULL, sectionNameSnapshot=NULL, accountIdSnapshot=58, accountCodeSnapshot='90300', accountNameSnapshot='מקדמות ביטוח לאומי', code6111Snapshot=NULL, description='עסק/מקדמות ביטוח לאומי', approvalStatus='APPROVED' WHERE id=3;
UPDATE `expense` SET subCategoryId=53, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='עסק/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=4;
UPDATE `expense` SET subCategoryId=93, sectionIdSnapshot=NULL, sectionCodeSnapshot=NULL, sectionNameSnapshot=NULL, accountIdSnapshot=58, accountCodeSnapshot='90300', accountNameSnapshot='מקדמות ביטוח לאומי', code6111Snapshot=NULL, description='עסק/מקדמות ביטוח לאומי', approvalStatus='APPROVED' WHERE id=5;
UPDATE `expense` SET subCategoryId=53, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='עסק/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=6;
UPDATE `expense` SET subCategoryId=93, sectionIdSnapshot=NULL, sectionCodeSnapshot=NULL, sectionNameSnapshot=NULL, accountIdSnapshot=58, accountCodeSnapshot='90300', accountNameSnapshot='מקדמות ביטוח לאומי', code6111Snapshot=NULL, description='עסק/מקדמות ביטוח לאומי', approvalStatus='APPROVED' WHERE id=7;
UPDATE `expense` SET subCategoryId=69, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/פלאפון', approvalStatus='APPROVED' WHERE id=8;
UPDATE `expense` SET subCategoryId=8, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/אינטרנט', approvalStatus='APPROVED' WHERE id=9;
UPDATE `expense` SET subCategoryId=19, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/כבישי אגרה', approvalStatus='APPROVED' WHERE id=10;
UPDATE `expense` SET subCategoryId=56, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='בנק, אשראי ותנועות/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=11;
UPDATE `expense` SET subCategoryId=69, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/פלאפון', approvalStatus='APPROVED' WHERE id=12;
UPDATE `expense` SET subCategoryId=20, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/מערכות', approvalStatus='APPROVED' WHERE id=13;
UPDATE `expense` SET subCategoryId=18, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/חניה', approvalStatus='APPROVED' WHERE id=14;
UPDATE `expense` SET subCategoryId=19, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/כבישי אגרה', approvalStatus='APPROVED' WHERE id=15;
UPDATE `expense` SET subCategoryId=18, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/חניה', approvalStatus='APPROVED' WHERE id=16;
UPDATE `expense` SET subCategoryId=69, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/פלאפון', approvalStatus='APPROVED' WHERE id=17;
UPDATE `expense` SET subCategoryId=8, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/אינטרנט', approvalStatus='APPROVED' WHERE id=18;
UPDATE `expense` SET subCategoryId=56, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='בנק, אשראי ותנועות/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=19;
UPDATE `expense` SET subCategoryId=20, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/מערכות', approvalStatus='APPROVED' WHERE id=20;
UPDATE `expense` SET subCategoryId=69, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/פלאפון', approvalStatus='APPROVED' WHERE id=21;
UPDATE `expense` SET subCategoryId=19, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/כבישי אגרה', approvalStatus='APPROVED' WHERE id=22;
UPDATE `expense` SET subCategoryId=56, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='בנק, אשראי ותנועות/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=23;
UPDATE `expense` SET subCategoryId=56, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='בנק, אשראי ותנועות/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=24;
UPDATE `expense` SET subCategoryId=3, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='דיור והוצאות הבית/ארנונה', approvalStatus='APPROVED' WHERE id=25;
UPDATE `expense` SET subCategoryId=53, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='עסק/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=26;
UPDATE `expense` SET subCategoryId=53, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='עסק/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=27;
UPDATE `expense` SET subCategoryId=53, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='עסק/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=28;
UPDATE `expense` SET subCategoryId=15, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/דלק', approvalStatus='APPROVED' WHERE id=29;
UPDATE `expense` SET subCategoryId=3, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='דיור והוצאות הבית/ארנונה', approvalStatus='APPROVED' WHERE id=30;
UPDATE `expense` SET subCategoryId=15, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/דלק', approvalStatus='APPROVED' WHERE id=31;
UPDATE `expense` SET subCategoryId=53, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='עסק/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=32;
UPDATE `expense` SET subCategoryId=53, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='עסק/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=33;
UPDATE `expense` SET subCategoryId=93, sectionIdSnapshot=NULL, sectionCodeSnapshot=NULL, sectionNameSnapshot=NULL, accountIdSnapshot=58, accountCodeSnapshot='90300', accountNameSnapshot='מקדמות ביטוח לאומי', code6111Snapshot=NULL, description='עסק/מקדמות ביטוח לאומי', approvalStatus='APPROVED' WHERE id=34;
UPDATE `expense` SET subCategoryId=53, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='עסק/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=35;
UPDATE `expense` SET subCategoryId=93, sectionIdSnapshot=NULL, sectionCodeSnapshot=NULL, sectionNameSnapshot=NULL, accountIdSnapshot=58, accountCodeSnapshot='90300', accountNameSnapshot='מקדמות ביטוח לאומי', code6111Snapshot=NULL, description='עסק/מקדמות ביטוח לאומי', approvalStatus='APPROVED' WHERE id=36;
UPDATE `expense` SET subCategoryId=53, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='עסק/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=37;
UPDATE `expense` SET subCategoryId=5, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='דיור והוצאות הבית/חשמל', approvalStatus='APPROVED' WHERE id=38;
UPDATE `expense` SET subCategoryId=69, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/פלאפון', approvalStatus='APPROVED' WHERE id=39;
UPDATE `expense` SET subCategoryId=8, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/אינטרנט', approvalStatus='APPROVED' WHERE id=40;
UPDATE `expense` SET subCategoryId=19, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/כבישי אגרה', approvalStatus='APPROVED' WHERE id=41;
UPDATE `expense` SET subCategoryId=56, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='בנק, אשראי ותנועות/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=42;
UPDATE `expense` SET subCategoryId=69, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/פלאפון', approvalStatus='APPROVED' WHERE id=43;
UPDATE `expense` SET subCategoryId=19, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/כבישי אגרה', approvalStatus='APPROVED' WHERE id=44;
UPDATE `expense` SET subCategoryId=20, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/מערכות', approvalStatus='APPROVED' WHERE id=45;
UPDATE `expense` SET subCategoryId=69, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/פלאפון', approvalStatus='APPROVED' WHERE id=46;
UPDATE `expense` SET subCategoryId=19, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/כבישי אגרה', approvalStatus='APPROVED' WHERE id=47;
UPDATE `expense` SET subCategoryId=56, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='בנק, אשראי ותנועות/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=48;
UPDATE `expense` SET subCategoryId=18, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/חניה', approvalStatus='APPROVED' WHERE id=49;
UPDATE `expense` SET subCategoryId=69, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/פלאפון', approvalStatus='APPROVED' WHERE id=50;
UPDATE `expense` SET subCategoryId=8, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/אינטרנט', approvalStatus='APPROVED' WHERE id=51;
UPDATE `expense` SET subCategoryId=5, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='דיור והוצאות הבית/חשמל', approvalStatus='APPROVED' WHERE id=52;
UPDATE `expense` SET subCategoryId=20, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/מערכות', approvalStatus='APPROVED' WHERE id=53;
UPDATE `expense` SET subCategoryId=18, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/חניה', approvalStatus='APPROVED' WHERE id=54;
UPDATE `expense` SET subCategoryId=56, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='בנק, אשראי ותנועות/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=55;
UPDATE `expense` SET subCategoryId=56, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='בנק, אשראי ותנועות/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=56;
UPDATE `expense` SET subCategoryId=45, sectionIdSnapshot=8, sectionCodeSnapshot='60600', sectionNameSnapshot='ייעוץ ושירותים מקצועיים', accountIdSnapshot=19, accountCodeSnapshot='60600', accountNameSnapshot='ייעוץ ושירותים מקצועיים', code6111Snapshot=NULL, description='עסק/ייעוץ והשתלמויות', approvalStatus='APPROVED' WHERE id=57;
UPDATE `expense` SET subCategoryId=15, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/דלק', approvalStatus='APPROVED' WHERE id=58;
UPDATE `expense` SET subCategoryId=42, sectionIdSnapshot=9, sectionCodeSnapshot='60700', sectionNameSnapshot='הנהלת חשבונות', accountIdSnapshot=20, accountCodeSnapshot='60700', accountNameSnapshot='הנהלת חשבונות', code6111Snapshot=NULL, description='עסק/הנהלת חשבונות', approvalStatus='APPROVED' WHERE id=59;
UPDATE `expense` SET subCategoryId=19, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/כבישי אגרה', approvalStatus='APPROVED' WHERE id=60;
UPDATE `expense` SET subCategoryId=18, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/חניה', approvalStatus='APPROVED' WHERE id=61;
UPDATE `expense` SET subCategoryId=56, sectionIdSnapshot=13, sectionCodeSnapshot='61100', sectionNameSnapshot='עמלות ודמי כרטיס', accountIdSnapshot=25, accountCodeSnapshot='61100', accountNameSnapshot='עמלות ודמי כרטיס', code6111Snapshot=NULL, description='בנק, אשראי ותנועות/עמלות ודמי כרטיס', approvalStatus='APPROVED' WHERE id=62;
UPDATE `expense` SET subCategoryId=40, sectionIdSnapshot=6, sectionCodeSnapshot='60400', sectionNameSnapshot='תוכנות ושירותי ענן', accountIdSnapshot=17, accountCodeSnapshot='60400', accountNameSnapshot='תוכנות ושירותי ענן', code6111Snapshot=NULL, description='עסק/תוכנות', approvalStatus='APPROVED' WHERE id=63;
UPDATE `expense` SET subCategoryId=40, sectionIdSnapshot=6, sectionCodeSnapshot='60400', sectionNameSnapshot='תוכנות ושירותי ענן', accountIdSnapshot=17, accountCodeSnapshot='60400', accountNameSnapshot='תוכנות ושירותי ענן', code6111Snapshot=NULL, description='עסק/תוכנות', approvalStatus='APPROVED' WHERE id=64;
UPDATE `expense` SET subCategoryId=40, sectionIdSnapshot=6, sectionCodeSnapshot='60400', sectionNameSnapshot='תוכנות ושירותי ענן', accountIdSnapshot=17, accountCodeSnapshot='60400', accountNameSnapshot='תוכנות ושירותי ענן', code6111Snapshot=NULL, description='עסק/תוכנות', approvalStatus='APPROVED' WHERE id=65;
UPDATE `expense` SET subCategoryId=93, sectionIdSnapshot=NULL, sectionCodeSnapshot=NULL, sectionNameSnapshot=NULL, accountIdSnapshot=58, accountCodeSnapshot='90300', accountNameSnapshot='מקדמות ביטוח לאומי', code6111Snapshot=NULL, description='עסק/מקדמות ביטוח לאומי', approvalStatus='APPROVED' WHERE id=66;
UPDATE `expense` SET subCategoryId=69, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/פלאפון', approvalStatus='APPROVED' WHERE id=67;
UPDATE `expense` SET subCategoryId=8, sectionIdSnapshot=5, sectionCodeSnapshot='60300', sectionNameSnapshot='תקשורת', accountIdSnapshot=16, accountCodeSnapshot='60300', accountNameSnapshot='תקשורת', code6111Snapshot=NULL, description='דיור והוצאות הבית/אינטרנט', approvalStatus='APPROVED' WHERE id=68;
UPDATE `expense` SET subCategoryId=79, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='עסק/שכירות משרד', approvalStatus='APPROVED' WHERE id=75;
UPDATE `expense` SET subCategoryId=20, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/מערכות', approvalStatus='APPROVED' WHERE id=76;
UPDATE `expense` SET subCategoryId=20, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/מערכות', approvalStatus='APPROVED' WHERE id=77;
UPDATE `expense` SET subCategoryId=20, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/מערכות', approvalStatus='APPROVED' WHERE id=78;
UPDATE `expense` SET subCategoryId=80, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='עסק/שליחויות', approvalStatus='APPROVED' WHERE id=79;
UPDATE `expense` SET subCategoryId=80, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='עסק/שליחויות', approvalStatus='APPROVED' WHERE id=80;
UPDATE `expense` SET subCategoryId=80, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='עסק/שליחויות', approvalStatus='APPROVED' WHERE id=81;
UPDATE `expense` SET subCategoryId=19, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/כבישי אגרה', approvalStatus='APPROVED' WHERE id=82;
UPDATE `expense` SET subCategoryId=19, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/כבישי אגרה', approvalStatus='APPROVED' WHERE id=83;
UPDATE `expense` SET subCategoryId=15, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/דלק', approvalStatus='APPROVED' WHERE id=84;
UPDATE `expense` SET subCategoryId=81, sectionIdSnapshot=8, sectionCodeSnapshot='60600', sectionNameSnapshot='ייעוץ ושירותים מקצועיים', accountIdSnapshot=19, accountCodeSnapshot='60600', accountNameSnapshot='ייעוץ ושירותים מקצועיים', code6111Snapshot=NULL, description='עסק/ייעוץ מקצועי', approvalStatus='APPROVED' WHERE id=85;
UPDATE `expense` SET subCategoryId=81, sectionIdSnapshot=8, sectionCodeSnapshot='60600', sectionNameSnapshot='ייעוץ ושירותים מקצועיים', accountIdSnapshot=19, accountCodeSnapshot='60600', accountNameSnapshot='ייעוץ ושירותים מקצועיים', code6111Snapshot=NULL, description='עסק/ייעוץ מקצועי', approvalStatus='APPROVED' WHERE id=86;
UPDATE `expense` SET subCategoryId=15, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/דלק', approvalStatus='APPROVED' WHERE id=87;
UPDATE `expense` SET subCategoryId=15, sectionIdSnapshot=4, sectionCodeSnapshot='60200', sectionNameSnapshot='רכב ותחבורה', accountIdSnapshot=15, accountCodeSnapshot='60200', accountNameSnapshot='רכב ותחבורה', code6111Snapshot=NULL, description='רכב ותחבורה/דלק', approvalStatus='APPROVED' WHERE id=88;
UPDATE `expense` SET subCategoryId=39, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='עסק/הוצאות משרד', approvalStatus='APPROVED' WHERE id=89;
UPDATE `expense` SET subCategoryId=39, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='עסק/הוצאות משרד', approvalStatus='APPROVED' WHERE id=90;
UPDATE `expense` SET subCategoryId=79, sectionIdSnapshot=3, sectionCodeSnapshot='60100', sectionNameSnapshot='הוצאות משרד', accountIdSnapshot=14, accountCodeSnapshot='60100', accountNameSnapshot='הוצאות משרד', code6111Snapshot=NULL, description='עסק/שכירות משרד', approvalStatus='APPROVED' WHERE id=91;

-- journal_entry.description (85 EXPENSE-referenced rows — re-asserted idempotently; only rows that were NULL/empty actually changed this session)
UPDATE `journal_entry` SET description='EXPENSE # - אלרן תחנות' WHERE id=10000157 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - אלרן תחנות' WHERE id=10000142 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - ביטוח לאומי ספק הוק' WHERE id=10000145 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס ויזה' WHERE id=10000149 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - ביטוח לאומי ספק הוק' WHERE id=10000158 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס ויזה' WHERE id=10000164 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - ביטוח לאומי ספק הוק' WHERE id=10000167 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - וויקום מובייל בע"מ' WHERE id=10000143 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - בזק הוראת קבע' WHERE id=10000146 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דרך ארץ הוראת קבע' WHERE id=10000147 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - בנק לאומי-דמי כרטיס' WHERE id=10000148 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - רמי לוי תקשורת' WHERE id=10000150 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - איתוראן הו"ק בע"מ' WHERE id=10000153 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - פנגו חשבונית חודשית' WHERE id=10000154 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - כביש 6 חוצה צפון בע"' WHERE id=10000155 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - פנגו-חניונים' WHERE id=10000156 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - וויקום מובייל בע"מ' WHERE id=10000159 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - בזק הוראת קבע' WHERE id=10000160 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - בנק לאומי-דמי כרטיס' WHERE id=10000161 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - איתוראן הו"ק בע"מ' WHERE id=10000162 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - רמי לוי תקשורת' WHERE id=10000163 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - כביש 6 חוצה צפון בע"' WHERE id=10000168 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס ויזה' WHERE id=10000151 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס ויזה' WHERE id=10000165 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - מ.א. גולן' WHERE id=10000144 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - עמל.ערוץ יש  5' WHERE id=10000141 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס מסטר' WHERE id=10000152 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס מסטר' WHERE id=10000166 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - אלרן תחנות' WHERE id=10000184 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - מ.א. גולן' WHERE id=10000172 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - אלרן תחנות' WHERE id=10000170 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס מסטר' WHERE id=10000179 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס מסטר' WHERE id=10000191 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - ביטוח לאומי ספק הוק' WHERE id=10000173 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס ויזה' WHERE id=10000180 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - ביטוח לאומי ספק הוק' WHERE id=10000186 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס ויזה' WHERE id=10000192 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - חברת החשמל לישראל בע' WHERE id=10000169 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - וויקום מובייל בע"מ' WHERE id=10000171 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - בזק הוראת קבע' WHERE id=10000174 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דרך ארץ הוראת קבע' WHERE id=10000175 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - בנק לאומי-דמי כרטיס' WHERE id=10000176 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - רמי לוי תקשורת' WHERE id=10000178 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - כביש 6 חוצה צפון בע"' WHERE id=10000182 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - איתוראן הו"ק בע"מ' WHERE id=10000183 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - וויקום מובייל בע"מ' WHERE id=10000185 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דרך ארץ הוראת קבע' WHERE id=10000187 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - בנק לאומי-דמי כרטיס' WHERE id=10000188 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - פנגו-חניונים' WHERE id=10000189 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - רמי לוי תקשורת' WHERE id=10000190 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - בזק הוראת קבע' WHERE id=10000193 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - חברת החשמל לישראל בע' WHERE id=10000195 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - איתוראן הו"ק בע"מ' WHERE id=10000196 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - פנגו-חניונים' WHERE id=10000197 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס ויזה' WHERE id=10000181 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - דמי כרטיס ויזה' WHERE id=10000194 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - אביחי כרמל' WHERE id=10000177 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - אלרן תחנות כח בע"מ' WHERE id=10000200 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - הייפ איזי קאונט' WHERE id=10000198 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - כביש 6 חוצה צפון בע"' WHERE id=10000199 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - פנגו-חניונים' WHERE id=10000201 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - עמל.ערוץ יש 17' WHERE id=10000045 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - OPENAI *CHATGPT SUBS' WHERE id=10000046 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - OPENAI *CHATGPT SUBS' WHERE id=10000047 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - OPENAI *CHATGPT SUBS' WHERE id=10000048 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - ביטוח לאומי ספק הוק' WHERE id=10000203 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - וויקום מובייל בע"מ' WHERE id=10000202 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE # - בזק הוראת קבע' WHERE id=10000204 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #7826 - אביב שני פיתוח ובניה בע"מ' WHERE id=10000123 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #71791876 - איטורן' WHERE id=10000110 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #72202281 - איטורן' WHERE id=10000118 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #72712685 - איטורן' WHERE id=10000125 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #6-010157772101-068819 - דואר ישראל' WHERE id=10000111 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #26-010102603914-053074 - דואר ישראל' WHERE id=10000112 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #26-010102607800-054606 - דואר ישראל' WHERE id=10000126 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #1260-494678 - דרך ארץ הייווייז (1997) בע"מ - כביש 6' WHERE id=10000116 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #1264-517405 - דרך ארץ הייווייז (1997) בע"מ - כביש 6' WHERE id=10000124 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #017909901079052 - מנטה קמעונאות דרכים בע"מ - דלק ניות' WHERE id=10000122 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #3078 - משה רז משרד עו"ד זנוטריון' WHERE id=10000119 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #30024 - עם דין ייעוץ נדלן' WHERE id=10000121 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #037609036916116 - פז קמעונאות ואנרגיה בע"מ' WHERE id=10000114 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #050009901647288 - פז קמעונאות ואנרגיה בע"מ' WHERE id=10000117 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #10576128 - פרטנר תקשורת בע"מ' WHERE id=10000113 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #12017246 - פרטנר תקשורת בע"מ' WHERE id=10000120 AND (description IS NULL OR description = '');
UPDATE `journal_entry` SET description='EXPENSE #7814 - אביב שני פיתוח ובניה בע"מ' WHERE id=10000115 AND (description IS NULL OR description = '');

-- supplier (11 rows with a resolved subCategoryId)
UPDATE `supplier` SET subCategoryId=20 WHERE id=1;
UPDATE `supplier` SET subCategoryId=80 WHERE id=2;
UPDATE `supplier` SET subCategoryId=79 WHERE id=3;
UPDATE `supplier` SET subCategoryId=19 WHERE id=4;
UPDATE `supplier` SET subCategoryId=15 WHERE id=5;
UPDATE `supplier` SET subCategoryId=81 WHERE id=6;
UPDATE `supplier` SET subCategoryId=81 WHERE id=7;
UPDATE `supplier` SET subCategoryId=15 WHERE id=8;
UPDATE `supplier` SET subCategoryId=15 WHERE id=9;
UPDATE `supplier` SET subCategoryId=39 WHERE id=10;
UPDATE `supplier` SET subCategoryId=39 WHERE id=11;

-- classified_transactions (196 rows with a resolved subCategoryId)
UPDATE `classified_transactions` SET subCategoryId=84 WHERE id=1;
UPDATE `classified_transactions` SET subCategoryId=83 WHERE id=2;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=3;
UPDATE `classified_transactions` SET subCategoryId=19 WHERE id=4;
UPDATE `classified_transactions` SET subCategoryId=18 WHERE id=5;
UPDATE `classified_transactions` SET subCategoryId=20 WHERE id=6;
UPDATE `classified_transactions` SET subCategoryId=37 WHERE id=7;
UPDATE `classified_transactions` SET subCategoryId=8 WHERE id=8;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=9;
UPDATE `classified_transactions` SET subCategoryId=69 WHERE id=10;
UPDATE `classified_transactions` SET subCategoryId=76 WHERE id=11;
UPDATE `classified_transactions` SET subCategoryId=19 WHERE id=12;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=14;
UPDATE `classified_transactions` SET subCategoryId=56 WHERE id=15;
UPDATE `classified_transactions` SET subCategoryId=53 WHERE id=16;
UPDATE `classified_transactions` SET subCategoryId=93 WHERE id=17;
UPDATE `classified_transactions` SET subCategoryId=73 WHERE id=18;
UPDATE `classified_transactions` SET subCategoryId=73 WHERE id=19;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=20;
UPDATE `classified_transactions` SET subCategoryId=40 WHERE id=21;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=22;
UPDATE `classified_transactions` SET subCategoryId=58 WHERE id=23;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=24;
UPDATE `classified_transactions` SET subCategoryId=62 WHERE id=25;
UPDATE `classified_transactions` SET subCategoryId=56 WHERE id=26;
UPDATE `classified_transactions` SET subCategoryId=69 WHERE id=27;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=28;
UPDATE `classified_transactions` SET subCategoryId=77 WHERE id=29;
UPDATE `classified_transactions` SET subCategoryId=18 WHERE id=30;
UPDATE `classified_transactions` SET subCategoryId=73 WHERE id=31;
UPDATE `classified_transactions` SET subCategoryId=3 WHERE id=32;
UPDATE `classified_transactions` SET subCategoryId=87 WHERE id=33;
UPDATE `classified_transactions` SET subCategoryId=58 WHERE id=34;
UPDATE `classified_transactions` SET subCategoryId=42 WHERE id=35;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=36;
UPDATE `classified_transactions` SET subCategoryId=82 WHERE id=37;
UPDATE `classified_transactions` SET subCategoryId=5 WHERE id=38;
UPDATE `classified_transactions` SET subCategoryId=88 WHERE id=39;
UPDATE `classified_transactions` SET subCategoryId=53 WHERE id=42;
UPDATE `classified_transactions` SET subCategoryId=89 WHERE id=43;
UPDATE `classified_transactions` SET subCategoryId=89 WHERE id=44;
UPDATE `classified_transactions` SET subCategoryId=57 WHERE id=45;
UPDATE `classified_transactions` SET subCategoryId=57 WHERE id=46;
UPDATE `classified_transactions` SET subCategoryId=57 WHERE id=47;
UPDATE `classified_transactions` SET subCategoryId=60 WHERE id=48;
UPDATE `classified_transactions` SET subCategoryId=57 WHERE id=49;
UPDATE `classified_transactions` SET subCategoryId=89 WHERE id=50;
UPDATE `classified_transactions` SET subCategoryId=87 WHERE id=51;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=52;
UPDATE `classified_transactions` SET subCategoryId=72 WHERE id=53;
UPDATE `classified_transactions` SET subCategoryId=61 WHERE id=54;
UPDATE `classified_transactions` SET subCategoryId=82 WHERE id=55;
UPDATE `classified_transactions` SET subCategoryId=61 WHERE id=56;
UPDATE `classified_transactions` SET subCategoryId=53 WHERE id=57;
UPDATE `classified_transactions` SET subCategoryId=56 WHERE id=58;
UPDATE `classified_transactions` SET subCategoryId=64 WHERE id=59;
UPDATE `classified_transactions` SET subCategoryId=78 WHERE id=60;
UPDATE `classified_transactions` SET subCategoryId=89 WHERE id=61;
UPDATE `classified_transactions` SET subCategoryId=71 WHERE id=62;
UPDATE `classified_transactions` SET subCategoryId=57 WHERE id=63;
UPDATE `classified_transactions` SET subCategoryId=90 WHERE id=64;
UPDATE `classified_transactions` SET subCategoryId=3 WHERE id=65;
UPDATE `classified_transactions` SET subCategoryId=91 WHERE id=66;
UPDATE `classified_transactions` SET subCategoryId=28 WHERE id=67;
UPDATE `classified_transactions` SET subCategoryId=3 WHERE id=68;
UPDATE `classified_transactions` SET subCategoryId=92 WHERE id=69;
UPDATE `classified_transactions` SET subCategoryId=64 WHERE id=70;
UPDATE `classified_transactions` SET subCategoryId=64 WHERE id=71;
UPDATE `classified_transactions` SET subCategoryId=64 WHERE id=72;
UPDATE `classified_transactions` SET subCategoryId=66 WHERE id=73;
UPDATE `classified_transactions` SET subCategoryId=66 WHERE id=74;
UPDATE `classified_transactions` SET subCategoryId=78 WHERE id=75;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=76;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=77;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=78;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=79;
UPDATE `classified_transactions` SET subCategoryId=18 WHERE id=80;
UPDATE `classified_transactions` SET subCategoryId=18 WHERE id=81;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=82;
UPDATE `classified_transactions` SET subCategoryId=13 WHERE id=83;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=84;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=85;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=86;
UPDATE `classified_transactions` SET subCategoryId=78 WHERE id=87;
UPDATE `classified_transactions` SET subCategoryId=73 WHERE id=88;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=89;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=90;
UPDATE `classified_transactions` SET subCategoryId=70 WHERE id=91;
UPDATE `classified_transactions` SET subCategoryId=16 WHERE id=92;
UPDATE `classified_transactions` SET subCategoryId=69 WHERE id=93;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=94;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=95;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=96;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=97;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=98;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=99;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=100;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=101;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=102;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=103;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=104;
UPDATE `classified_transactions` SET subCategoryId=19 WHERE id=105;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=106;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=107;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=108;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=109;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=110;
UPDATE `classified_transactions` SET subCategoryId=18 WHERE id=111;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=112;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=113;
UPDATE `classified_transactions` SET subCategoryId=10 WHERE id=114;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=115;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=116;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=117;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=118;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=119;
UPDATE `classified_transactions` SET subCategoryId=73 WHERE id=120;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=121;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=122;
UPDATE `classified_transactions` SET subCategoryId=1 WHERE id=123;
UPDATE `classified_transactions` SET subCategoryId=1 WHERE id=124;
UPDATE `classified_transactions` SET subCategoryId=24 WHERE id=125;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=126;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=127;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=128;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=129;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=130;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=131;
UPDATE `classified_transactions` SET subCategoryId=26 WHERE id=132;
UPDATE `classified_transactions` SET subCategoryId=70 WHERE id=133;
UPDATE `classified_transactions` SET subCategoryId=26 WHERE id=134;
UPDATE `classified_transactions` SET subCategoryId=17 WHERE id=135;
UPDATE `classified_transactions` SET subCategoryId=26 WHERE id=136;
UPDATE `classified_transactions` SET subCategoryId=10 WHERE id=137;
UPDATE `classified_transactions` SET subCategoryId=36 WHERE id=138;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=139;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=140;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=141;
UPDATE `classified_transactions` SET subCategoryId=24 WHERE id=142;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=143;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=144;
UPDATE `classified_transactions` SET subCategoryId=14 WHERE id=145;
UPDATE `classified_transactions` SET subCategoryId=14 WHERE id=146;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=147;
UPDATE `classified_transactions` SET subCategoryId=14 WHERE id=148;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=149;
UPDATE `classified_transactions` SET subCategoryId=72 WHERE id=150;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=151;
UPDATE `classified_transactions` SET subCategoryId=24 WHERE id=152;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=153;
UPDATE `classified_transactions` SET subCategoryId=38 WHERE id=154;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=155;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=156;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=157;
UPDATE `classified_transactions` SET subCategoryId=61 WHERE id=158;
UPDATE `classified_transactions` SET subCategoryId=10 WHERE id=159;
UPDATE `classified_transactions` SET subCategoryId=12 WHERE id=160;
UPDATE `classified_transactions` SET subCategoryId=61 WHERE id=161;
UPDATE `classified_transactions` SET subCategoryId=32 WHERE id=162;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=163;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=164;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=165;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=166;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=167;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=168;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=169;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=170;
UPDATE `classified_transactions` SET subCategoryId=25 WHERE id=171;
UPDATE `classified_transactions` SET subCategoryId=15 WHERE id=172;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=173;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=174;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=175;
UPDATE `classified_transactions` SET subCategoryId=73 WHERE id=176;
UPDATE `classified_transactions` SET subCategoryId=17 WHERE id=177;
UPDATE `classified_transactions` SET subCategoryId=73 WHERE id=178;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=179;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=180;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=181;
UPDATE `classified_transactions` SET subCategoryId=22 WHERE id=182;
UPDATE `classified_transactions` SET subCategoryId=26 WHERE id=183;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=184;
UPDATE `classified_transactions` SET subCategoryId=35 WHERE id=185;
UPDATE `classified_transactions` SET subCategoryId=17 WHERE id=186;
UPDATE `classified_transactions` SET subCategoryId=16 WHERE id=187;
UPDATE `classified_transactions` SET subCategoryId=32 WHERE id=188;
UPDATE `classified_transactions` SET subCategoryId=17 WHERE id=189;
UPDATE `classified_transactions` SET subCategoryId=95 WHERE id=190;
UPDATE `classified_transactions` SET subCategoryId=65 WHERE id=191;
UPDATE `classified_transactions` SET subCategoryId=64 WHERE id=192;
UPDATE `classified_transactions` SET subCategoryId=96 WHERE id=193;
UPDATE `classified_transactions` SET subCategoryId=63 WHERE id=194;
UPDATE `classified_transactions` SET subCategoryId=63 WHERE id=195;
UPDATE `classified_transactions` SET subCategoryId=66 WHERE id=196;
UPDATE `classified_transactions` SET subCategoryId=63 WHERE id=197;
UPDATE `classified_transactions` SET subCategoryId=63 WHERE id=198;
UPDATE `classified_transactions` SET subCategoryId=48 WHERE id=200;

-- extracted_document (33 rows)
UPDATE `extracted_document` SET sub_category_id=19, document_kind='EXPENSE_INVOICE' WHERE id=1;
UPDATE `extracted_document` SET sub_category_id=19, document_kind='EXPENSE_INVOICE' WHERE id=2;
UPDATE `extracted_document` SET sub_category_id=81, document_kind='EXPENSE_INVOICE' WHERE id=3;
UPDATE `extracted_document` SET sub_category_id=15, document_kind='EXPENSE_INVOICE' WHERE id=4;
UPDATE `extracted_document` SET sub_category_id=15, document_kind='EXPENSE_INVOICE' WHERE id=5;
UPDATE `extracted_document` SET sub_category_id=20, document_kind='EXPENSE_INVOICE' WHERE id=6;
UPDATE `extracted_document` SET sub_category_id=20, document_kind='EXPENSE_INVOICE' WHERE id=7;
UPDATE `extracted_document` SET sub_category_id=20, document_kind='EXPENSE_INVOICE' WHERE id=8;
UPDATE `extracted_document` SET sub_category_id=69, document_kind='EXPENSE_INVOICE' WHERE id=9;
UPDATE `extracted_document` SET sub_category_id=69, document_kind='EXPENSE_INVOICE' WHERE id=10;
UPDATE `extracted_document` SET sub_category_id=1, document_kind='EXPENSE_INVOICE' WHERE id=11;
UPDATE `extracted_document` SET sub_category_id=81, document_kind='EXPENSE_INVOICE' WHERE id=12;
UPDATE `extracted_document` SET sub_category_id=15, document_kind='EXPENSE_INVOICE' WHERE id=13;
UPDATE `extracted_document` SET sub_category_id=80, document_kind='EXPENSE_INVOICE' WHERE id=14;
UPDATE `extracted_document` SET sub_category_id=80, document_kind='EXPENSE_INVOICE' WHERE id=15;
UPDATE `extracted_document` SET sub_category_id=80, document_kind='EXPENSE_INVOICE' WHERE id=16;
UPDATE `extracted_document` SET sub_category_id=79, document_kind='EXPENSE_INVOICE' WHERE id=17;
UPDATE `extracted_document` SET sub_category_id=19, document_kind='EXPENSE_INVOICE' WHERE id=18;
UPDATE `extracted_document` SET sub_category_id=19, document_kind='EXPENSE_INVOICE' WHERE id=19;
UPDATE `extracted_document` SET sub_category_id=81, document_kind='EXPENSE_INVOICE' WHERE id=20;
UPDATE `extracted_document` SET sub_category_id=15, document_kind='EXPENSE_INVOICE' WHERE id=21;
UPDATE `extracted_document` SET sub_category_id=15, document_kind='EXPENSE_INVOICE' WHERE id=22;
UPDATE `extracted_document` SET sub_category_id=20, document_kind='EXPENSE_INVOICE' WHERE id=23;
UPDATE `extracted_document` SET sub_category_id=20, document_kind='EXPENSE_INVOICE' WHERE id=24;
UPDATE `extracted_document` SET sub_category_id=20, document_kind='EXPENSE_INVOICE' WHERE id=25;
UPDATE `extracted_document` SET sub_category_id=69, document_kind='EXPENSE_INVOICE' WHERE id=26;
UPDATE `extracted_document` SET sub_category_id=69, document_kind='EXPENSE_INVOICE' WHERE id=27;
UPDATE `extracted_document` SET sub_category_id=79, document_kind='EXPENSE_INVOICE' WHERE id=28;
UPDATE `extracted_document` SET sub_category_id=81, document_kind='EXPENSE_INVOICE' WHERE id=29;
UPDATE `extracted_document` SET sub_category_id=15, document_kind='EXPENSE_INVOICE' WHERE id=30;
UPDATE `extracted_document` SET sub_category_id=80, document_kind='EXPENSE_INVOICE' WHERE id=31;
UPDATE `extracted_document` SET sub_category_id=80, document_kind='EXPENSE_INVOICE' WHERE id=32;
UPDATE `extracted_document` SET sub_category_id=80, document_kind='EXPENSE_INVOICE' WHERE id=33;

COMMIT;

-- ============================================================================
-- POST-PHASE-3 VERIFICATION (run manually, review output)
-- ============================================================================
-- Expect 0 from every one of these:
-- SELECT COUNT(*) FROM expense WHERE approvalStatus = 'APPROVED' AND subCategoryId IS NULL;
-- SELECT COUNT(*) FROM expense WHERE approvalStatus = 'APPROVED' AND (accountIdSnapshot IS NULL OR accountCodeSnapshot IS NULL);
-- SELECT COUNT(*) FROM expense WHERE description IS NULL;
-- SELECT COUNT(*) FROM expense WHERE approvalStatus IS NULL;
-- SELECT COUNT(*) FROM expense WHERE subCategoryId IS NOT NULL AND subCategoryId NOT IN (SELECT id FROM sub_category);
--
-- Expect the constraint listed:
-- SHOW CREATE TABLE expense;
--
-- D14/D15 spot-check — expect 0 (the 6 Bituach Leumi rows must snapshot onto
-- the 90300 technical account with no section):
-- SELECT COUNT(*) FROM expense WHERE category = 'עסק' AND subCategory = 'מקדמות ביטוח לאומי' AND (accountCodeSnapshot != '90300' OR sectionIdSnapshot IS NOT NULL);
--
-- Full automated re-run: backend/scripts/verify-phase3-backfill.ts, plus
-- generate-baseline-reports.ts + compare-baseline-reports.ts for the report-
-- reproduction check (Definition of Done per the master plan).
-- ============================================================================


-- ============================================================================
-- SECTION 7 (Phase 4.5, schema-drift.md Gap 3) — journal_entry.referenceId
-- nullability.
--
-- Gap 3 was flagged in Phase 0.6 (schema-drift.md) as a yes/no deferred to
-- "whichever phase actually introduces manual journal entries" — that was
-- Phase 4.5 (`BookkeepingService.createManualJournalEntry`, live since
-- Session 9, sets `referenceId: null` for MANUAL entries). The ALTER was
-- never actually appended to cutover.sql at that time — added here
-- 2026-07-13 during cutover review, before it ships to production as a real
-- gap: `journal_entry.referenceId` is still `int NOT NULL` in production, so
-- the first manual journal entry posted after cutover would fail with a
-- NOT NULL constraint violation.
--
-- No data changes needed: no MANUAL referenceType rows exist in production
-- today (schema-drift.md Gap 3), so no existing row has a value that would
-- conflict with the relaxed constraint.
-- ============================================================================

ALTER TABLE `journal_entry`
  MODIFY COLUMN `referenceId` bigint NULL;

-- Verification (run after applying, expect 1 row, Null = YES):
-- SHOW COLUMNS FROM journal_entry LIKE 'referenceId';
--
-- Expect 0 — confirms no existing row's referenceId is unexpectedly NULL
-- from anything other than a genuine MANUAL entry going forward.
-- SELECT COUNT(*) FROM journal_entry WHERE referenceId IS NULL AND referenceType <> 'MANUAL';


-- ============================================================================
-- PHASE 0.3 / D12.4 - UNIQUE(businessNumber) on business  (Session 8)
-- ============================================================================
-- STATUS 2026-09-06: this dedup has ALREADY BEEN APPLIED IN PRODUCTION -
-- business id 5 is deleted and id 12 survives holding 314719279 (verified
-- directly against production by Elazar). The DELETE below is therefore now
-- an expected NO-OP; it is left in place unchanged as the guard it always
-- was, so this file stays safe to run end-to-end against an older restore.
--
-- VERIFICATION FIRST (run manually, review output BEFORE the statements below):
-- production may have drifted since the dump. Expect ZERO groups now that the
-- 314719279 dedup is done - if ANY group appears, STOP and resolve it with
-- Elazar before proceeding. (Before 2026-09-06 this step expected exactly ONE
-- group, businessNumber 314719279 held by ids 5 and 12; that is now history.)
--
-- SELECT businessNumber, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
--   FROM business
--   WHERE businessNumber IS NOT NULL AND businessNumber <> ''
--   GROUP BY businessNumber HAVING n > 1;

START TRANSACTION;

-- Elazar's decision (Session 8): delete business id=5 ("נגרות", user שמואל הראל,
-- EXEMPT, zero expenses/journal entries/documents); id=12 ("פוטובלוק שמואל",
-- LICENSED) keeps the number. Guarded by the businessNumber predicate so the
-- statement is a no-op if ids have drifted.
DELETE FROM business WHERE id = 5 AND businessNumber = '314719279';

-- Named unique index, matching business.entity.ts. Nullable column - MySQL
-- allows multiple NULLs under a UNIQUE index.
ALTER TABLE business ADD UNIQUE INDEX ux_business_number (businessNumber);

COMMIT;

-- Post-check: expect 0 rows deleted (the dedup was already applied in
-- production on/before 2026-09-06 - 1 row deleted only if you are running this
-- against an older restore that still has id 5), index present in
-- SHOW INDEX FROM business, and the duplicate SELECT above returns 0 rows.


-- ============================================================================
-- SECTION 8 (2026-07-18, Elazar) — close the "רכוש קבוע (פחת)" catalog gap.
--
-- NO NEW SQL IN THIS SECTION — same mechanism as Section 5. The three
-- depreciable-equipment cards (61310 מחשב / 61320 ריהוט / 61330 רכב, section
-- "פחת") already existed with zero sub_category rows pointing at them
-- (flagged in chart.seed.ts §61300 as "zero rows in prod"); a bug report
-- against the mannual-expense edit form's equipment checkbox surfaced this —
-- checking "רכוש קבוע" tried to classify under a category that had never
-- actually been seeded, and the frontend also failed to reset a stale
-- subCategory left over from whatever category was active before the
-- checkbox forced the swap (that frontend bug is fixed separately, not a
-- catalog change).
--
-- This session adds, to the reviewed source data:
--   - `chart.seed.ts` CHART_ACCOUNTS: one new card, code 61390 "רכישת משרד"
--     (office purchase — a capitalized asset, not a renumbered legacy one),
--     under section 61300. 61340-61380 in this block's anchor+10..+90 range
--     are already taken by the unrelated §3f ANNUAL technical accounts, so
--     61390 is the last free slot before the next block's anchor.
--     vatPercent=100, taxPercent=0, reductionPercent=2 (depreciation),
--     isEquipment=1, recognitionType=RECOGNIZED — taxPercent=0 matches the
--     other 3 equipment cards (capitalized assets are deducted via
--     depreciation, not directly).
--   - `catalog.seed.ts` SYSTEM_CATEGORIES: one new category, 'רכוש קבוע (פחת)'.
--   - `catalog.seed.ts` SYSTEM_SUB_CATEGORIES: four new sub-categories under
--     it — מחשב/ריהוט/רכב (pointing at the pre-existing 61310/61320/61330
--     cards) and רכישת משרד (pointing at the new 61390 card above).
--
-- Per `catalog-seed.service.ts`'s documented boot sequence, `seedAccounts()`
-- find-or-**creates** `booking_account` rows by (chartOwnerKey, code) — not
-- update-only — and `seedSystemCatalog()` find-or-creates `category` rows
-- and create-if-missing `sub_category` rows. So the next backend boot after
-- this code deploys (dev now; production at cutover, same ordering
-- requirement as Section 5: this boot must happen AFTER the rest of
-- cutover.sql has run) creates all 5 new rows (1 account + 1 category + 4
-- sub-categories) automatically — no manual INSERT needed, and this is
-- purely additive: no existing category/sub_category/booking_account name
-- collides with these, so no existing row is touched.
-- ============================================================================


-- ============================================================================
-- SECTION 9 (2026-08-06, Elazar) — blocking single-row save + supplier-
-- driven cascade in the report-review edit dialogs (new
-- reports/me/review/update-doc and update-tx endpoints).
--
-- Two new NULLable columns so a review row's classification can be
-- persisted onto its pending source row (extracted_document /
-- slim_transactions) BEFORE approval, instead of only living in-memory
-- until the user clicks approve:
--
--   - `extracted_document.vat_reporting_date` — this table had NO period
--     column at all before this section (only slim_transactions did).
--     Mirrors the property name already used everywhere else
--     (SlimTransaction/Expense/FullTransactionCache.vatReportingDate),
--     snake_case column name matching this entity's own convention
--     (supplier_id, sub_category_id, document_kind, ...).
--   - `slim_transactions.sub_category_id` — this table had no D1 thin-
--     pointer column at all before this section (Supplier and
--     extracted_document already do). snake_case column name, matching
--     this entity's own convention (supplier_id, document_kind, ...) and
--     the `@Column({ name: 'sub_category_id', ... })` mapping the entity
--     actually declares.
--
-- Both NULLable with no default-value backfill in this script — existing
-- rows simply read NULL (equivalent to "no pre-approval edit was ever
-- saved for this row yet", which is true for every row that predates this
-- feature). No data migration needed or included here.
-- ============================================================================

ALTER TABLE `extracted_document`
  ADD COLUMN `vat_reporting_date` varchar(255) NULL DEFAULT NULL;

ALTER TABLE `slim_transactions`
  ADD COLUMN `sub_category_id` int NULL DEFAULT NULL;

-- Verification (run after applying, expect 1 row from both):
--   SHOW COLUMNS FROM extracted_document LIKE 'vat_reporting_date';
--   SHOW COLUMNS FROM slim_transactions LIKE 'sub_category_id';
-- ============================================================================


-- ============================================================================
-- SECTION 10 (2026-08-21, Elazar) — professional electronic equipment.
--
-- NO NEW SQL IN THIS SECTION — same create-if-missing seed mechanism as
-- Sections 5 and 8. The reviewed flat seed now adds:
--   - booking_account 61400, "ציוד אלקטרוני מקצועי – פחת 15%",
--     SYSTEM-owned under section 61300 (פחת), code6111=3580,
--     vatPercent=100, taxPercent=0, reductionPercent=15, isEquipment=1,
--     recognitionType=RECOGNIZED;
--   - a same-named SYSTEM sub_category under "רכוש קבוע (פחת)"
--     pointing at account 61400.
--
-- Tax basis reviewed 2026-08-21: Schedule B, III(3)(יד)(1) of the Income
-- Tax (Depreciation) Regulations, 1941 sets 15% for electronic/computerized
-- equipment. This card deliberately excludes computers, which retain their
-- separate 61310 / 33.33% treatment.
-- ============================================================================


-- ============================================================================
-- SECTION 11 (2026-08-21, Elazar) — automatic prorated depreciation.
--
-- Adds a real activation date, an idempotency/audit row per equipment
-- expense+tax-year, and the DEPRECIATION journal reference type. Existing
-- equipment rows default activationDate to their purchase date. Journal
-- postings themselves are created by application code: activation year on
-- expense approval; later years by POST /reports/pnl-report-journal/prepare.
-- See docs/depreciation-posting-behavior.md for the locked behavior and edge
-- cases.
-- ============================================================================

ALTER TABLE `expense`
  ADD COLUMN `activationDate` date NULL DEFAULT NULL AFTER `date`;

UPDATE `expense`
SET `activationDate` = `date`
WHERE `isEquipmentSnapshot` = 1 AND `activationDate` IS NULL;

ALTER TABLE `journal_entry`
  MODIFY COLUMN `referenceType` ENUM(
    'RECEIPT', 'TAX_INVOICE', 'TAX_INVOICE_RECEIPT',
    'TRANSACTION_INVOICE', 'CREDIT_INVOICE', 'EXPENSE', 'PAYMENT',
    'MANUAL', 'VAT_PAYMENT', 'ADJUSTMENT', 'OPENING_BALANCE',
    'DEPRECIATION'
  ) NULL;

CREATE TABLE `asset_depreciation_posting` (
  `id` int NOT NULL AUTO_INCREMENT,
  `expenseId` int NOT NULL,
  `firebaseId` varchar(255) NOT NULL,
  `businessNumber` varchar(255) NOT NULL,
  `taxYear` int NOT NULL,
  `activationDateSnapshot` date NOT NULL,
  `originalCostSnapshot` decimal(12,2) NOT NULL,
  `depreciationRateSnapshot` decimal(5,2) NOT NULL,
  `activeDays` int NOT NULL,
  `daysInYear` int NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `sourceAccountCode` varchar(255) NOT NULL,
  `journalEntryNumber` int NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_asset_depreciation_expense_year` (`expenseId`, `taxYear`),
  KEY `ix_asset_depreciation_business_year` (`businessNumber`, `taxYear`),
  CONSTRAINT `fk_asset_depreciation_expense`
    FOREIGN KEY (`expenseId`) REFERENCES `expense` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Verification — first query must return 0; SHOW INDEX must include the
-- unique expense/year key.
-- SELECT COUNT(*) AS equipment_without_activation_date
-- FROM expense WHERE isEquipmentSnapshot = 1 AND activationDate IS NULL;
-- SHOW INDEX FROM asset_depreciation_posting;


-- ============================================================================
-- SECTION 12 (2026-08-28, Elazar) — reversible archive deletion.
--
-- Archive deletion no longer overwrites extracted_document.status. The
-- nullable timestamp hides a Drive-backed document while retaining its OCR
-- lifecycle, Expense link and accounting history; clearing it restores that
-- exact prior state. Existing rows remain visible because NULL means active.
-- ============================================================================

ALTER TABLE `extracted_document`
  ADD COLUMN `deleted_at` datetime NULL DEFAULT NULL AFTER `status`;

-- Verification (must return exactly one nullable datetime column):
-- SHOW COLUMNS FROM extracted_document LIKE 'deleted_at';


-- ============================================================================
-- SECTION 13 (2026-08-29, Elazar) -- preserve fractional supplier percentages.
--
-- Supplier percentages are a convenience cache only (D1). The application
-- now returns and writes the linked booking_account percentages, while these
-- columns retain the exact cached values instead of rounding 66.67 to 67.
-- Existing mapped suppliers are refreshed from their authoritative account.
-- ============================================================================

ALTER TABLE `supplier`
  MODIFY COLUMN `taxPercent` decimal(5,2) NOT NULL,
  MODIFY COLUMN `vatPercent` decimal(5,2) NOT NULL;

UPDATE `supplier` s
JOIN `sub_category` sc ON sc.`id` = s.`subCategoryId`
JOIN `booking_account` ba ON ba.`id` = sc.`accountId`
SET s.`taxPercent` = ba.`taxPercent`,
    s.`vatPercent` = ba.`vatPercent`
WHERE s.`subCategoryId` IS NOT NULL
  AND ba.`taxPercent` IS NOT NULL
  AND ba.`vatPercent` IS NOT NULL;

-- Verification: column Type values must be decimal(5,2), and the final query
-- must return zero rows.
-- SHOW COLUMNS FROM supplier WHERE Field IN ('taxPercent', 'vatPercent');
-- SELECT s.id, s.supplier, s.taxPercent, ba.taxPercent,
--        s.vatPercent, ba.vatPercent
-- FROM supplier s
-- JOIN sub_category sc ON sc.id = s.subCategoryId
-- JOIN booking_account ba ON ba.id = sc.accountId
-- WHERE s.taxPercent <> ba.taxPercent OR s.vatPercent <> ba.vatPercent;


-- ============================================================================
-- SECTION 14 (2026-08-30, Elazar) -- optional document rejection reason.
--
-- Review-screen rejection remains a soft lifecycle transition: the OCR row
-- and Drive file are retained. This nullable explanation is displayed in a
-- dedicated archive column. Existing rejected documents remain NULL.
-- ============================================================================

ALTER TABLE `extracted_document`
  ADD COLUMN `rejection_reason` varchar(500) NULL DEFAULT NULL AFTER `status`;

-- Verification (must return exactly one nullable varchar(500) column):
-- SHOW COLUMNS FROM extracted_document LIKE 'rejection_reason';


-- ============================================================================
-- SECTION 15 (2026-09-07, Elazar) -- separate VAT and annual-report periods.
--
-- vatReportingDate is now VAT-only. Annual income-tax membership is stored
-- independently so submitting an annual report never overwrites the VAT
-- period. Expense rows are backfilled from their current accounting date;
-- legacy transaction rows carrying a bare four-digit year are migrated out
-- of vatReportingDate without changing monthly/bimonthly VAT labels.
-- ============================================================================

ALTER TABLE `expense`
  ADD COLUMN `annualReportingYear` int NULL DEFAULT NULL AFTER `vatReportingDate`;

ALTER TABLE `slim_transactions`
  ADD COLUMN `annualReportingYear` int NULL DEFAULT NULL AFTER `vatReportingDate`;

ALTER TABLE `full_transactions_cache`
  ADD COLUMN `annualReportingYear` int NULL DEFAULT NULL AFTER `vatReportingDate`;

UPDATE `expense`
SET `annualReportingYear` = YEAR(`date`)
WHERE `annualReportingYear` IS NULL
  AND `date` IS NOT NULL;

UPDATE `slim_transactions`
SET `annualReportingYear` = CAST(`vatReportingDate` AS UNSIGNED),
    `vatReportingDate` = NULL
WHERE `vatReportingDate` REGEXP '^[0-9]{4}$';

UPDATE `full_transactions_cache`
SET `annualReportingYear` = CAST(`vatReportingDate` AS UNSIGNED),
    `vatReportingDate` = NULL
WHERE `vatReportingDate` REGEXP '^[0-9]{4}$';

-- Verification: all three columns must exist; no VAT-period field may retain
-- a bare annual year; every dated expense must have an annual reporting year.
-- SHOW COLUMNS FROM expense LIKE 'annualReportingYear';
-- SHOW COLUMNS FROM slim_transactions LIKE 'annualReportingYear';
-- SHOW COLUMNS FROM full_transactions_cache LIKE 'annualReportingYear';
-- SELECT COUNT(*) AS invalid_annual_labels
-- FROM slim_transactions WHERE vatReportingDate REGEXP '^[0-9]{4}$';
-- SELECT COUNT(*) AS invalid_cache_annual_labels
-- FROM full_transactions_cache WHERE vatReportingDate REGEXP '^[0-9]{4}$';
-- SELECT COUNT(*) AS expenses_without_annual_year
-- FROM expense WHERE date IS NOT NULL AND annualReportingYear IS NULL;


-- ============================================================================
-- SECTION 16 (2026-09-07, Elazar) -- harden VAT input equipment classification.
--
-- VAT input totals split account 2410 between ordinary inputs and fixed
-- assets. Legacy NULL values could make a line disappear from both buckets.
-- Recover the source expense snapshot where possible, then make the journal
-- field non-null so every 2410 line belongs to exactly one bucket.
-- ============================================================================

UPDATE `journal_line` jl
JOIN `journal_entry` je ON je.`id` = jl.`journalEntryId`
LEFT JOIN `expense` e
  ON e.`journalEntryNumber` = je.`entryNumber`
 AND CAST(e.`businessNumber` AS BINARY) = CAST(je.`issuerBusinessNumber` AS BINARY)
 AND CAST(e.`userId` AS BINARY) = CAST(je.`firebaseId` AS BINARY)
SET jl.`isEquipment` = COALESCE(e.`isEquipmentSnapshot`, 0)
WHERE jl.`isEquipment` IS NULL
  AND jl.`accountCode` = '2410';

UPDATE `journal_line`
SET `isEquipment` = 0
WHERE `isEquipment` IS NULL;

ALTER TABLE `journal_line`
  MODIFY COLUMN `isEquipment` tinyint NOT NULL DEFAULT 0;

-- Verification: both queries must return zero.
-- SELECT COUNT(*) AS null_equipment_flags
-- FROM journal_line WHERE isEquipment IS NULL;
-- SELECT COUNT(*) AS unbucketed_vat_lines
-- FROM journal_line WHERE accountCode = '2410' AND isEquipment IS NULL;


-- ============================================================================
-- SECTION 17 (2026-09-27, Elazar) -- complimentary full billing access.
--
-- This entitlement is intentionally independent of subscription status. An
-- administrator can grant all modules without a plan or payment, while the
-- default preserves every existing subscription's standard billing behavior.
-- The two audit event values record grants and revocations.
-- ============================================================================

ALTER TABLE `subscription`
  ADD COLUMN `billing_access_mode`
    enum('STANDARD','COMPLIMENTARY_FULL') NOT NULL DEFAULT 'STANDARD'
    AFTER `status`;

ALTER TABLE `billing_event`
  MODIFY COLUMN `event_type` enum(
    'CHECKOUT_CREATED',
    'WEBHOOK_RECEIVED',
    'PAYMENT_VERIFIED',
    'PAYMENT_SUCCESS',
    'PAYMENT_FAILED',
    'SUBSCRIPTION_ACTIVATED',
    'SUBSCRIPTION_CANCELED',
    'RENEWAL_SUCCESS',
    'RENEWAL_FAILED',
    'RETRY_SCHEDULED',
    'PLAN_CHANGE_REQUESTED',
    'PLAN_CHANGED',
    'PAYMENT_METHOD_UPDATE_REQUESTED',
    'PAYMENT_METHOD_UPDATED',
    'PAYMENT_METHOD_UPDATE_FAILED',
    'COUPON_REDEEMED',
    'PROMOTION_APPLIED',
    'DISCOUNT_APPLIED',
    'RECEIPT_FAILED',
    'DUPLICATE_PAYMENT_IGNORED',
    'BILLING_EXEMPTION_GRANTED',
    'BILLING_EXEMPTION_REVOKED'
  ) NOT NULL;

-- Verification: the first query must show STANDARD as the non-null default;
-- the second must include both BILLING_EXEMPTION_* enum values.
-- SHOW COLUMNS FROM subscription LIKE 'billing_access_mode';
-- SHOW COLUMNS FROM billing_event LIKE 'event_type';


-- ============================================================================
-- SECTION 18 (2026-10-02, Elazar) -- durable pending transaction archive.
--
-- Classified transactions awaiting approval must remain visible after the
-- nightly full_transactions_cache cleanup. Persist only the source display
-- fields needed by the archive/approval fallback; accounting remains deferred
-- until the existing explicit approval flow creates an Expense and journal.
-- ============================================================================

ALTER TABLE `slim_transactions`
  ADD COLUMN `merchantNameSnapshot` varchar(255) NULL DEFAULT NULL AFTER `businessNumber`,
  ADD COLUMN `transactionDateSnapshot` date NULL DEFAULT NULL AFTER `merchantNameSnapshot`,
  ADD COLUMN `amountSnapshot` decimal(10,2) NULL DEFAULT NULL AFTER `transactionDateSnapshot`,
  ADD COLUMN `currencySnapshot` varchar(3) NULL DEFAULT NULL AFTER `amountSnapshot`,
  ADD COLUMN `ilsAmountSnapshot` decimal(12,2) NULL DEFAULT NULL AFTER `currencySnapshot`,
  ADD INDEX `IDX_slim_archive_pending`
    (`userId`, `businessNumber`, `isRecognized`, `confirmed`, `matched_document_id`);

UPDATE `slim_transactions` s
JOIN `full_transactions_cache` c
  ON c.`userId` = s.`userId`
 AND c.`externalTransactionId` = s.`externalTransactionId`
SET s.`merchantNameSnapshot` = c.`merchantName`,
    s.`transactionDateSnapshot` = c.`transactionDate`,
    s.`amountSnapshot` = c.`amount`,
    s.`currencySnapshot` = UPPER(COALESCE(c.`currency`, 'ILS')),
    s.`ilsAmountSnapshot` = c.`ilsAmount`
WHERE s.`merchantNameSnapshot` IS NULL
   OR s.`transactionDateSnapshot` IS NULL
   OR s.`amountSnapshot` IS NULL;

-- Verification: the columns/index must exist. The last query lists legacy
-- classified pending rows whose cache data was already unavailable at cutover;
-- those rows become complete on their next bank sync before approval.
-- SHOW COLUMNS FROM slim_transactions LIKE '%Snapshot';
-- SHOW INDEX FROM slim_transactions WHERE Key_name = 'IDX_slim_archive_pending';
-- SELECT id, userId, externalTransactionId
-- FROM slim_transactions
-- WHERE isRecognized = 1 AND confirmed = 0
--   AND (merchantNameSnapshot IS NULL
--     OR transactionDateSnapshot IS NULL OR amountSnapshot IS NULL);

-- SECTION 19 (2026-10-07, Elazar) -- retire the Finsite integration.
--
-- Open Banking transaction ingestion now runs exclusively through Feezback.
-- The production-copy audit found no users linked to Finsite and no rows in
-- the legacy transactions table; the remaining Finsite rows are unreferenced
-- provider metadata. Remove the retired provider table and its two obsolete
-- identifier columns. The active Feezback identifier is stored as
-- externalTransactionId in slim_transactions/full_transactions_cache.
-- ============================================================================

DROP TABLE `finsite`;

ALTER TABLE `user`
  DROP COLUMN `finsiteId`;

ALTER TABLE `transactions`
  DROP COLUMN `finsiteId`;

-- Verification: all three queries must return zero rows.
-- SELECT TABLE_NAME FROM information_schema.TABLES
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'finsite';
-- SELECT COLUMN_NAME FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user'
--   AND COLUMN_NAME = 'finsiteId';
-- SELECT COLUMN_NAME FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions'
--   AND COLUMN_NAME = 'finsiteId';

-- Billing sections appended after origin/main Sections 17, 18 and 19.
-- SECTION 20 (2026-09-17, Elazar) -- durable billing obligations and attempts.
--
-- Persistence foundation only. Existing checkout/renewal/recovery/webhook
-- runtime paths are not switched by this section. billing_event remains an
-- audit trail; the three new aggregate tables become the future coordination
-- source of truth when the runtime migration is delivered separately.
--
-- MySQL UNIQUE indexes permit multiple NULL values. Nullable active/satisfied
-- and provenance pointers therefore enforce one linked effect when populated
-- while allowing unrelated rows to remain NULL.
-- ============================================================================

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
  'ALTER TABLE `documents` ADD COLUMN `billing_attempt_id` int NULL DEFAULT NULL AFTER `journalEntryId`'
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

-- Circular pointers are added only after both aggregate tables exist.
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

-- billing_event is audit-only. These nullable links correlate old/new events
-- without making event rows the coordination mechanism.
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

-- Add each audit index and FK only when absent, so this additive section can
-- be safely resumed after a partial manual cutover.
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

-- Verification: all counts must be 1, all three tables must be empty before
-- runtime migration/backfill, and no SQL in this section initiates a charge.
-- SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_obligation';
-- SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_attempt';
-- SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_method_update_attempt';
-- SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription' AND COLUMN_NAME = 'billing_anchor_day';
-- SELECT COUNT(*) FROM billing_obligation;
-- SELECT COUNT(*) FROM billing_attempt;
-- SELECT COUNT(*) FROM payment_method_update_attempt;
-- SHOW CREATE TABLE billing_obligation;
-- SHOW CREATE TABLE billing_attempt;
-- SHOW CREATE TABLE payment_method_update_attempt;

-- SECTION 21. KT-040: one payment attempt can settle several subscription periods.
-- Code/DDL approved by Elazar on 2026-10-05. NOT approved for execution.
-- Requires Section 20, stopped billing writers, and an explicitly approved DB.
-- Retain billing_attempt.obligation_id as the primary debt for owner routing
-- and attempt numbering; this link table is the complete frozen membership.
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

-- Add FK-supporting non-unique indexes before removing the old UNIQUE indexes.
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

-- Verification: first query must return zero; do not execute old Section 20's
-- empty-table assertions on an existing runtime database.
-- SELECT COUNT(*) FROM billing_attempt a LEFT JOIN billing_attempt_obligation l
--   ON l.attempt_id=a.id AND l.obligation_id=a.obligation_id WHERE l.attempt_id IS NULL;
-- SHOW CREATE TABLE billing_attempt_obligation;
-- SHOW INDEX FROM billing_obligation;

-- 2026-10-08: referral field already defined in referral-signup/production-migration.md.
-- Additive and resumable; also restores dev schema removed by older synchronize.
SET @kt054_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user' AND COLUMN_NAME='referral_code'),
  'SELECT 1',
  'ALTER TABLE `user` ADD COLUMN `referral_code` VARCHAR(32) NULL DEFAULT NULL');
PREPARE kt054_stmt FROM @kt054_sql;
EXECUTE kt054_stmt;
DEALLOCATE PREPARE kt054_stmt;
SET @kt054_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user' AND INDEX_NAME='ux_user_referral_code'),
  'SELECT 1',
  'ALTER TABLE `user` ADD UNIQUE INDEX `ux_user_referral_code` (`referral_code`)');
PREPARE kt054_stmt FROM @kt054_sql;
EXECUTE kt054_stmt;
DEALLOCATE PREPARE kt054_stmt;
