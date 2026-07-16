-- ============================================================================
-- reportScope model change (2026-07-14) — schema DDL.
-- NOT transactional — DDL auto-commits in MySQL. Run once against
-- keepintax_prodcopy before 2026-07-14_reportscope_card_migration.ts's
-- MODE=apply (which seeds the new accounts/repoints via the app, then
-- writes the targeted UPDATE — see docs/redesign/reportscope-card-migration-review.md).
--
-- Same convention as every prior ALTER in this project: run against a
-- fresh-enough keepintax_prodcopy, verify column-for-column against the
-- entities before running for real (account.entity.ts / sub-category.entity.ts).
-- ============================================================================

ALTER TABLE `booking_account`
  ADD COLUMN `reportScope` ENUM('pnl','annual','technical') NOT NULL DEFAULT 'pnl' AFTER `recognitionType`;

-- Widen recognitionType to add NOT_APPLICABLE (Elazar's correction, same
-- session): the TECHNICAL (90100-90600) and ANNUAL (61340-61380) cards below
-- are not "unrecognized business expenses" (that's NOT_RECOGNIZED, e.g.
-- קנסות) — they're not business expenses at all. Existing RECOGNIZED/
-- NOT_RECOGNIZED rows are untouched by this MODIFY (MySQL preserves values
-- still present in the new value list).
ALTER TABLE `booking_account`
  MODIFY COLUMN `recognitionType` ENUM('RECOGNIZED','NOT_RECOGNIZED','NOT_APPLICABLE') NULL DEFAULT NULL;

ALTER TABLE `sub_category`
  DROP COLUMN `reportScope`;
