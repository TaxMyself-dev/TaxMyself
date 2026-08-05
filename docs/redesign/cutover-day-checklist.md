# Production cutover checklist — categories/accounting redesign

Filled in against the plan's generic 7-step checklist
(`categories-redesign-master-plan.md` "Production cutover checklist").
Execute manually, in order. Do not skip a step because a prior rehearsal
looked clean — the "final rehearsal must run the exact file that will run
in production" rule exists because `cutover.sql` keeps changing until the
day it doesn't.

Databases involved:
- **`keepintax-prod`** — real production. The only target that matters at
  the end. Never boot the full app against it with `synchronize` enabled.
- **`keepintax_prodcopy`** — same shared MySQL host as `keepintax-dev`
  (`34.165.27.179`), restored from `_prod_dump/keepintax-prod.sql`. Rehearsal
  target only, never touched by real users.
- **`keepintax-dev`** — shared/remote, `synchronize=true`. Not part of
  cutover; do not rehearse cutover.sql here (see `shared-dev-db-synchronize-thrash`
  — synchronize will fight raw DDL/data changes on this DB).

---

## Step 1 — Full rehearsal on a FRESH dump

1. Get a fresh production export (phpMyAdmin export or `mysqldump`) —
   do NOT reuse the existing `_prod_dump/keepintax-prod.sql`, which is now
   several sessions stale.
2. Drop and recreate `keepintax_prodcopy`, import the fresh dump.
3. Run `docs/redesign/cutover.sql` against `keepintax_prodcopy` **end to
   end, section by section, in file order** — Section 1 → (business dedup,
   now at the end of the file — see note below) → Section 3 (pre-flight →
   A → B → C+D → post-migration) → Section 4 (4a → 4b → post-migration) →
   Section 5 (no SQL — informational only) → Section 6 (6a → 6b → 6c →
   post-Phase-3 verification) → Section 7 (`referenceId` nullability) →
   the trailing `PHASE 0.3 / D12.4` business section.
4. After the script completes, boot the full app once against
   `keepintax_prodcopy` with:
   ```
   DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true
   ```
   (both flags — `NODE_ENV=production` disables `synchronize`;
   `SKIP_BOOT_SEED=true` no-ops `CatalogSeedService` so it doesn't
   double-write what the script just inserted). Confirm the boot log shows
   `synchronize=false` and no seed-write lines.
5. Run the verification suite:
   - `backend/scripts/generate-baseline-reports.ts` against
     `keepintax_prodcopy` → regenerate
     `docs/redesign/baseline-reports-post-migration/`.
   - `backend/scripts/compare-baseline-reports.ts` against the pre-redesign
     golden files in `docs/redesign/baseline-reports/` — expect **zero
     un-registered diffs** across all businesses. Any diff must already be
     listed, with its exact expected delta, in
     `docs/redesign/intentional-diffs.md` (D15) — otherwise STOP.
   - `backend/scripts/verify-phase3-backfill.ts` — expect all checks green
     (zero un-backfilled `APPROVED` expenses, zero orphaned `subCategoryId`).
6. If anything is unclean: fix `cutover.sql` (never hand-patch the rehearsal
   DB and call it done), re-import a fresh dump, repeat from step 3.
7. **Do not proceed to Step 2 until one full pass is completely clean.**

## Step 2 — Announce the maintenance window

- Tell users (however you currently do — email/banner/etc.) a short window
  is coming; stop the backend so no writes land mid-cutover (no new
  expenses, journal entries, delegations, etc. during the window).

## Step 3 — Fresh production backup

- `mysqldump` (or Cloud SQL export) of `keepintax-prod`, taken immediately
  before touching anything.
- Verify the backup: restore it to a scratch DB and spot-check row counts
  against the live `production-baseline.md` figures before proceeding.
- This backup — not the rehearsal dump from Step 1 — is what you restore
  from if Step 6 finds an unexplained diff.

## Step 4 — Run `cutover.sql` against production

- In phpMyAdmin (or your preferred MySQL client) against `keepintax-prod`,
  run `docs/redesign/cutover.sql` **section by section, in file order**,
  checking each section's embedded verification `SELECT`s (commented
  inline) before moving to the next:
  1. **Section 1** (Phase 0.4) — two protective `UNIQUE` constraints on
     `default_sub_category`/`user_sub_category`. Verify: both dedup
     `SELECT`s return 0 rows.
  2. **Business dedup + `ux_business_number`** (Phase 0.3/D12.4, now at the
     end of the file, independent of everything else — safe to run here or
     earlier). Verify: the pre-check `SELECT` shows exactly the one known
     group (businessNumber `314719279`, ids 5 & 12) before running; after,
     `SHOW INDEX FROM business` lists `ux_business_number` and the dedup
     `SELECT` returns 0 rows.
  3. **Section 3** (Phase 1.4, chart renumbering) — run the pre-flight
     `SELECT`s first and *read the output*: the account-5000 guard query
     must return 0 rows or STOP (plan rule 5). Section A (DDL, no
     transaction — a failure here means restore-from-backup, not rollback).
     Section B (seed inserts). Section C+D (data renumbering, real
     transaction). Post-migration verification: old codes absent, sums
     match pre-flight exactly, 16/59/50 row counts, 0 orphaned codes.
  4. **Section 4** (Phase 2.1/2.2, catalog migration) — 4a (DDL, no
     transaction). 4b (literal category/sub_category/booking_account data,
     real transaction). Post-migration verification: 14/96/2 row counts,
     zero duplicates, zero orphaned `accountId`, zero private rows with an
     `accountId`.
  5. **Section 5** (Phase 2.6) — no SQL to run; informational only
     (confirms `CatalogSeedService`'s first real boot will be a no-op).
  6. **Section 6** (Phase 3, FK backfill + snapshots) — 6a (schema DDL).
     6b (the one real FK, `fk_expense_sub_category` — run only after 6c has
     backfilled every row, per the file's own ordering note). 6c (literal
     backfill data, real transaction). Post-Phase-3 verification: 0 rows
     from every listed guard `SELECT`, FK present in `SHOW CREATE TABLE
     expense`, the D14/D15 Bituach Leumi spot-check returns 0.
  7. **Section 7** (Phase 4.5, `referenceId` nullability) — the new section
     added during this cutover review. Verify: `SHOW COLUMNS FROM
     journal_entry LIKE 'referenceId'` shows `Null = YES`.
- If any section's verification is not clean: **STOP. Do not continue to
  later sections.** Move to the abort path in Step 6.

## Step 5 — Deploy the new backend + frontend

- Deploy with `NODE_ENV=production` set as always. **Do not set
  `SKIP_BOOT_SEED`** on the real production deploy — `CatalogSeedService`
  should run its normal boot-time reconciliation (Section 5 confirmed this
  is a no-op against the data `cutover.sql` just wrote; the flag exists only
  for one-off script runs against `keepintax_prodcopy`, not for the real
  app).
- Confirm the boot log shows `synchronize=false` (the `app.module.ts`
  boot-time guard from the 2026-07-12 incident fix will hard-refuse to
  start otherwise against a `/prod/i`-matching `DB_DATABASE`, so a clean
  boot is itself a check).

## Step 6 — Post-cutover verification

- Run `backend/scripts/generate-baseline-reports.ts` +
  `backend/scripts/compare-baseline-reports.ts` against real
  `keepintax-prod` — expect zero un-registered diffs, same as Step 1.
- Spot-check the D14/D15 Bituach Leumi entries and one or two other
  businesses' P&L/VAT/ledger reports manually in the UI.
- **Any unexplained diff → restore the Step 3 backup, redeploy the
  pre-cutover backend/frontend build, investigate in dev before
  re-attempting.** Do not patch production live to chase a diff.

## Step 7 — Unfreeze

- Resume normal traffic / lift the maintenance banner.
- Phase 7 cleanup (dropping `default_category`/`default_sub_category`/
  `user_category`/`user_sub_category`, `booking_account.pnlCategory`, and
  the old `AccountSeedService` remnants) runs as a second, small, separate
  script 2–4 weeks later — not part of this checklist.

---

## Fixes applied to `cutover.sql` during this review (2026-07-13)

1. **Removed the stale Section 2** (top of file) — it staged the
   pre-investigation Session-1 guess (delete business id=12, constraint
   named `uq_business_businessNumber`), which conflicted with the actual
   Session-8 D12.4 decision at the end of the file (delete id=5, constraint
   named `ux_business_number`, matching `business.entity.ts`). Running both
   as they stood would have deleted **both** businesses under
   `businessNumber = '314719279'` instead of just one.
2. **Added Section 7** (`journal_entry.referenceId` nullability) —
   `schema-drift.md` Gap 3 was explicitly deferred to "whichever phase
   introduces manual journal entries" (Phase 4.5), but the corresponding
   `ALTER TABLE journal_entry MODIFY referenceId bigint NULL` was never
   actually appended when that phase shipped. Without it, the first manual
   journal entry created in production after cutover would fail on a NOT
   NULL violation.

A systematic pass cross-checking every entity file changed since Session 1
(2026-07-10) against `cutover.sql`'s sections found no other gaps — see the
session's audit trail in `worklog.md`.
