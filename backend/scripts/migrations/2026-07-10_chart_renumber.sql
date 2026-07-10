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
  ADD COLUMN `recognitionType`  ENUM('RECOGNIZED','NOT_RECOGNIZED') NULL DEFAULT NULL AFTER `isEquipment`,
  ADD COLUMN `ownerType`        ENUM('SYSTEM','ACCOUNTANT','CLIENT') NOT NULL DEFAULT 'SYSTEM' AFTER `recognitionType`,
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

-- booking_account (59 rows) — sectionId resolved by subquery on the just-inserted sections --
INSERT INTO `booking_account`
  (`code`, `name`, `type`, `pnlCategory`, `displayOrder`, `sectionId`, `code6111`, `vatPercent`, `taxPercent`, `reductionPercent`, `isEquipment`, `recognitionType`, `ownerType`, `chartOwnerKey`, `accountantId`, `userId`, `businessNumber`, `visibilityScope`, `isActive`)
VALUES
  ('1000', 'חשבון מעבר', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('1100', 'בנק', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('1110', 'מזומן', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('1120', 'כרטיס אשראי / סליקה', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('1200', 'לקוחות כלליים', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('2000', 'ספקים כלליים', 'liability', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('2100', 'כרטיסי אשראי לתשלום', 'liability', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('2400', 'מע"מ עסקאות', 'liability', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('2410', 'מע"מ תשומות', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('40000', 'הכנסות', 'income', 'הכנסות', 1, (SELECT id FROM `accounting_section` WHERE `code` = '40000' AND `chartOwnerKey` = 'SYSTEM'), NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('40010', 'הכנסות פטורות', 'income', 'הכנסות פטורות', 2, (SELECT id FROM `accounting_section` WHERE `code` = '40010' AND `chartOwnerKey` = 'SYSTEM'), NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60000', 'הוצאות לא מוכרות', 'expense', 'הוצאות בלתי מזוהות', 14, (SELECT id FROM `accounting_section` WHERE `code` = '60000' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 0, 0, 0, 'NOT_RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60010', 'ספקים — כללי (הוצאה מוכרת)', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60000' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60100', 'הוצאות משרד', 'expense', 'הוצאות משרד', 3, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60200', 'רכב ותחבורה', 'expense', 'רכב ותחבורה', 4, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60300', 'תקשורת', 'expense', 'תקשורת', 5, (SELECT id FROM `accounting_section` WHERE `code` = '60300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 25, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60400', 'תוכנות ושירותי ענן', 'expense', 'תוכנות ושירותי ענן', 6, (SELECT id FROM `accounting_section` WHERE `code` = '60400' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60500', 'שיווק ופרסום', 'expense', 'שיווק ופרסום', 7, (SELECT id FROM `accounting_section` WHERE `code` = '60500' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60600', 'ייעוץ ושירותים מקצועיים', 'expense', 'ייעוץ ושירותים מקצועיים', 8, (SELECT id FROM `accounting_section` WHERE `code` = '60600' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60700', 'הנהלת חשבונות', 'expense', 'הנהלת חשבונות', 9, (SELECT id FROM `accounting_section` WHERE `code` = '60700' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60800', 'שכר', 'expense', 'שכר', 10, (SELECT id FROM `accounting_section` WHERE `code` = '60800' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60900', 'ספרות מקצועית', 'expense', 'ספרות מקצועית', 11, (SELECT id FROM `accounting_section` WHERE `code` = '60900' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61000', 'כיבוד', 'expense', 'כיבוד', 12, (SELECT id FROM `accounting_section` WHERE `code` = '61000' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 80, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61010', 'מתנות מוכרות', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61000' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61100', 'עמלות ודמי כרטיס', 'expense', 'עמלות ודמי כרטיס', 13, (SELECT id FROM `accounting_section` WHERE `code` = '61100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61200', 'הוצאות מימון', 'expense', 'הוצאות מימון', 15, (SELECT id FROM `accounting_section` WHERE `code` = '61200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61300', 'פחת', 'expense', 'פחת', 16, (SELECT id FROM `accounting_section` WHERE `code` = '61300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 0, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60110', 'ארנונה', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60120', 'גז', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60130', 'ועד בית', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60140', 'חשמל', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60150', 'מים', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60160', 'תחזוקה', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60170', 'שכירות משרד', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60180', 'שליחויות', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60210', 'ביטוח רכב', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 45, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60220', 'דלק', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60230', 'חניה', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60240', 'טיפולים', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60250', 'כבישי אגרה', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60260', 'מערכות', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60270', 'תחבורה ציבורית', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 66.67, 45, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60310', 'אינטרנט', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 25, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60320', 'טלפון קווי', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 25, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60330', 'פלאפון', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 25, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60410', 'תוכנות', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60400' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60610', 'ייעוץ והשתלמויות', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60600' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60620', 'ייעוץ מקצועי', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60600' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('60810', 'הוצאות שכר', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '60800' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61110', 'עמלות ודמי כרטיס (עסק)', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61120', 'עמלות ודמי כרטיס (בנק, אשראי ותנועות)', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61100' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 25, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61210', 'ריבית', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61200' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 100, 0, 0, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61310', 'מחשב', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 0, 33.33, 1, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61320', 'ריהוט', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 100, 0, 7, 1, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('61330', 'רכב', 'expense', NULL, NULL, (SELECT id FROM `accounting_section` WHERE `code` = '61300' AND `chartOwnerKey` = 'SYSTEM'), NULL, 0, 0, 15, 1, 'RECOGNIZED', 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('90100', 'מקדמות מס הכנסה', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('90200', 'גביית מע"מ', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('90300', 'מקדמות ביטוח לאומי', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1),
  ('90400', 'מס במקור שנוכה מלקוחות', 'asset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SYSTEM', 'SYSTEM', NULL, NULL, NULL, NULL, 1);

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
