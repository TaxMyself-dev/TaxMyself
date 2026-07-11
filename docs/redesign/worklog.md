# Categories & accounting redesign — worklog

## 2026-07-10 — Session 1 (Phase 0, complete)

Ran Phase 0 in full against `keepintax_prodcopy`, a database restored from
`_prod_dump/keepintax-prod.sql` on the shared MySQL host (per Elazar's
explicit direction — no local MySQL client/server exists on this machine,
so "local copy" for this project means this dedicated database on the
existing shared host, not `keepintax-dev`).

- **0.1/backup**: verified the dump restores cleanly and repeatably (did
  so three times this session, see "issues" below).
- **0.2/0.4**: ran every query from `categories-audit.md §8`, wrote
  `production-baseline.md`. All D14 figures re-verified exactly except one
  correction (see below). Zero orphans, zero duplicate catalog rows.
  Applied both protective UNIQUE constraints from `cutover.sql` §1.
- **0.6**: full schema-drift audit, `schema-drift.md`. 9/14 tables clean.
  5 gaps found: 2 already anticipated by D2/D14 (`subAccountCode`,
  `subCounterAccountCode` — never migrated to prod), 3 new
  (`journal_entry.referenceId` type/nullability mismatch — open item;
  missing `@Index` on `expense.source_document_id`; two undeclared +
  unnamed indexes on `extracted_document`, likely the actual mechanism
  behind the known dev-DB synchronize thrash — both are cheap entity-only
  fixes, not yet applied since they weren't asked for this session).
- **0.5**: `backend/scripts/generate-baseline-reports.ts`, 9 businesses
  with journal data, per-period + aggregate VAT/P&L + full ledger, in
  `docs/redesign/baseline-reports/`.

**Corrections made to the plan this session** (both approved by Elazar):
- D15's Bituach Leumi delta was wrong ("~₪29,645" → actual ₪22,645 gross /
  ₪11,775.40 `amountForTax`, the latter being what P&L actually sums).
  Corrected in the master plan and in the new
  `docs/redesign/intentional-diffs.md` registry (correction #1).
- D12.4 (`UNIQUE(business.businessNumber)`) was blocked by a real
  duplicate (`businessNumber` 314719279 on two empty test rows, ids 5 and
  12). Investigated, zero dependents on either side, Elazar chose to keep
  id 5. Staged as `cutover.sql` §2 (delete id 12, then the constraint),
  rehearsed and verified against `keepintax_prodcopy`. Ships in Session 8
  with the rest of D12, not now.

**Tooling fix**: `AccountSeedService.onModuleInit` now honors
`SKIP_BOOT_SEED=true` (no-op) — booting the full Nest app against
`keepintax_prodcopy` was silently growing `default_category`/
`default_sub_category` via the boot-time seeder. Confirmed harmless to
report totals (the seeder never touches `journal_entry`/`journal_line`,
and left `default_booking_account` — what the P&L join reads — completely
unchanged), but it broke the "byte-for-byte mirror of prod" invariant the
redesign work depends on. Deleted along with the whole service in Phase
2.6; re-import-the-dump documented as the fallback if the flag ever stops
covering every write path.

**Issues hit and recovered from, for the record:**
1. First `generate-baseline-reports.ts` run didn't set `NODE_ENV`, so
   TypeORM's `synchronize` (on by default outside `NODE_ENV=production`)
   partially mutated `keepintax_prodcopy`'s schema before crashing on an
   unrelated `feezback_webhook_events` duplicate-key error. Recovered by
   `DROP DATABASE` + full re-import — the dump file itself was never at
   risk. **Lesson: always set `NODE_ENV=production` when booting the app
   against this DB**, now baked into the script's usage comment.
2. Even with `synchronize` off, `AccountSeedService` still mutated catalog
   tables on boot (see "Tooling fix" above) — required a second re-import
   and root-caused before the real baseline fixtures were generated.

**Phase 0 checklist status**: 0.1/0.2/0.4/0.5/0.6 done. 0.3 (D12 security
fixes) deferred to Session 8 per Elazar's standing decision — D12.4 is
investigated and staged, D12.1–D12.3 not yet started.

**Next**: Session 2 (Phase 1.1–1.3, the new chart of accounts) —
`Current phase: 1` set in `CLAUDE.md`.

## 2026-07-10 — Session 2 (Phase 1.1–1.3, complete)

Read the master plan + `schema-drift.md` first, per the runbook. Built the
full proposed chart as a review table
(`docs/redesign/phase1-chart-review.md`) and presented it BEFORE writing any
seed code, per the Session 2 prompt.

- **Discrepancy found and flagged, not silently resolved**: the plan's task
  1.3 text says sections come from "the current 18 P&L categories." A
  targeted search (reports.service.ts, expenses.service.ts, frontend,
  categories-audit.md) found exactly 16 distinct `pnlCategory` strings, not
  18. Proceeded with 16 (documented in the review doc and the plan's
  checkbox); Elazar did not have 2 specific additional sections in mind
  when asked.
- **Two review-gate questions resolved with Elazar** (AskUserQuestion):
  1. `code6111` — no verified source for the official Form 6111 code list
     exists in the repo. Rather than guess (explicitly forbidden by D2/1.3),
     left every account's `code6111` NULL. Elazar will provide the official
     list in a later session.
  2. Confirmed the new `90200 גביית מע"מ` technical account (D14 decision
     3) as the VAT-remittance clearing account, distinct from the existing
     transactional `2400`/`2410` accounts.
- **Numbering formula used** (documented in `chart.seed.ts` and the review
  doc): balance-sheet 1000–2999 unchanged; income `new = old × 10`; expense
  parents/sub-ledger `new = old + 55000`. Produces a 62-row chart (9
  balance-sheet + 2 income + 14 expense parents + 34 sub-ledger accounts +
  3 brand-new D14 technical accounts) and a 50-row `account_code_migration`
  map (62 minus the 9 unchanged minus the 3 brand-new).
- **Entities**: `AccountingSection` (new), `BookingAccount` (renamed from
  `DefaultBookingAccount`/`default_booking_account`, extended per D1.2),
  `AccountCodeMigration` (new, holds the migration map as real rows). All
  three registered in `bookkeeping.module.ts` and `app.module.ts`, but
  deliberately **not** wired into any boot-time seeder — `chart.seed.ts` is
  flat data only, consumed by Phase 1.4/2.6's future runner, not by the
  existing `AccountSeedService` (which keeps seeding the OLD `account.seed.ts`
  chart unchanged, so current runtime behavior is untouched this session).
- **Rename ripple**: `DefaultBookingAccount` → `BookingAccount` updated
  across every real caller (not just the entity file) —
  `account-seed.service.ts`, `account.seed.ts`, `bookkeeping.service.ts` +
  spec, `reports.service.ts`, `reports.module.ts`, `documents.service.ts`,
  `documents.module.ts`, `demo-data.service.ts`, `app.module.ts`,
  `ledger-report.dto.ts` (comment only). `tsc --noEmit` clean on every
  touched file; remaining pre-existing errors (users/auth specs,
  report-workflow spec) are untouched and unrelated.
- **New shared enums**: `OwnerType`, `VisibilityScope`,
  `SYSTEM_CHART_OWNER_KEY` added to `src/enum.ts` (D4) — will be reused by
  Phase 2's `Category`/`SubCategory` entities.

**Open item carried forward**: `docs/redesign/phase1-chart-review.md` §0
item 4 (six sub-ledger accounts whose name collides with their parent
account's name, e.g. `60103 הוצאות משרד` under parent `60100 הוצאות משרד`)
— left as-is pending Elazar's rename decision; harmless (only `code` is
unique) but worth a pass before Phase 2 exposes these as picker options.

**Next**: Session 3A (1.5, `getNextAccountCode`) may run in parallel with a
future Session 2-continuation; Session 4 (1.4, the actual renumbering
script) needs Plan Mode and Elazar's `code6111` list would help but isn't
blocking since 1.4 only touches account codes, not 6111.

## 2026-07-10 — Session 3A (Phase 1.5, complete)

New `AccountCodeAllocatorService`
(`backend/src/bookkeeping/account-code-allocator.service.ts`), registered
(and exported) in `bookkeeping.module.ts`. `getNextAccountCode({ ownerType,
type, chartOwnerKey }, manager?)` returns the next free `booking_account`
code as a string.

- **Ranges implemented exactly per D2**: SYSTEM income 40000–49999 /
  expense 60000–69999; ACCOUNTANT income 50000–59999 / expense
  70000–79999; CLIENT income 50000–59999 (shared numeric range with
  ACCOUNTANT — isolation is by `chartOwnerKey`, per D2's
  `UNIQUE(chartOwnerKey, code)`, not by code range) / expense 80000–89999.
- **Scope decision, not in the plan text, flagged here rather than
  guessed silently**: the function only auto-allocates `type: 'income' |
  'expense'`. The 90000–99999 "technical/adjustment" range and the
  1000–2999 balance-sheet range are hand-seeded (see `chart.seed.ts`'s
  90100/90200/90300 D14 rows) — nothing in the plan describes a runtime
  flow that allocates into either range, so the service throws a clear
  `BadRequestException` for any other `type` rather than inventing a
  range. Revisit if Phase 5's D11 "כרטיס טכני בלבד" flow turns out to need
  one.
- **Algorithm**: loads existing `code`s for the given `chartOwnerKey` only,
  filters to those numerically inside the target range (out-of-range
  manual codes are ignored, not treated as errors — "tolerated"), takes
  the max + 10, or the range floor if none exist. Throws if the range is
  exhausted. Takes an optional `EntityManager` so callers (Phase 2
  `CatalogService`, Phase 5 D11 add-account flow) can allocate inside
  their own transaction.
- **Tests**: `account-code-allocator.service.spec.ts`, 14 cases — floor
  per ownerType/type pair, jump-of-10 continuation, per-chartOwnerKey
  isolation, out-of-range manual codes ignored, in-range off-grid manual
  codes jumped from without collision, unknown type throws, exhausted
  range throws, EntityManager override bypasses the injected repo. All
  green. `tsc --noEmit` shows zero new errors (pre-existing failures in
  `users`/`report-workflow` specs are untouched).

**Next**: Session 2-continuation or Session 4 (1.4, the renumbering
script) per the runbook.

## 2026-07-10 — Chart-revision session (1.2/1.3 REVISED, APPROVED & COMMITTED)

Triggered by same-day revisions to D1/D3/D5/D9/D11 (accounting law — vat%,
tax%, isEquipment, reductionPercent, recognition — moved from `sub_category`
onto the `booking_account` card). Rebuilt `chart.seed.ts` and extended
`BookingAccount` before task 1.4; **stopped short of committing**, per this
session's explicit instruction — awaiting Elazar's review of
`docs/redesign/phase1-chart-review.md` (full rewrite) and
`docs/redesign/chart-review.xlsx` (regenerated, now includes the five new
law columns).

- **Entity**: added `vatPercent`/`taxPercent`/`reductionPercent` (decimal,
  nullable), `isEquipment` (boolean, nullable), `recognitionType` (new enum
  `RecognitionType`, nullable) to `BookingAccount`. All nullable — NULL on
  every non-expense account (income/balance-sheet/technical), same
  convention as `code6111`.
- **Percents sourced live**: connected read-only (via `mysql2`, no app boot)
  to `keepintax_prodcopy`.`default_sub_category` (87 rows) instead of
  reusing `account-seed.service.ts`'s `SUBCATEGORY_TAX_VAT_DEFAULTS`, which
  is stale in several places (e.g. כיבוד hardcoded as 100/0, live data is
  80/0 — matches Elazar's explicit "כיבוד tax 80" instruction exactly).
- **Section codes revised**: now equal their block's anchor account code
  (e.g. section רכב ותחבורה = `60200`), replacing the old arbitrary
  `10/20/.../160` scheme.
- **Children renumbered**: jumps of 10 from the anchor, replacing `+1/+2/…`.
  Anchors are 100 apart → max 9 children per block. One block (5100, 10 old
  children) exceeded that — resolved via a new "identical-name merges into
  parent" rule, which also happened to clean up 5 of the original 6
  name-collision picker annoyances for free.
- **Percent-conflict check run** (task 1.3, explicit ask): 8 of 13 non-null
  old account codes had more than one real `(tax%, vat%, isRecognized)`
  combination live in prod. Every one resolved or explicitly flagged rather
  than silently merged — full writeup in the review doc §6. Two genuinely
  new judgment calls fell out of this and are NOT yet confirmed: a new
  `60010 ספקים — כללי` child (splits a real conflict on old code 5000), and
  the requested `90400 מס במקור שנוכה מלקוחות` + a proposed `61010 מתנות
  מוכרות` (code/section/percents all placeholder — no source data exists for
  it anywhere, flagged prominently, not invented past that point).
- **Data-quality findings surfaced, not silently fixed** (see review doc §0):
  a `SUBCATEGORY_SUB_ACCOUNT_CODES` naming bug (hardcoded "שכר" never
  actually matched the live row, which is named "הוצאות שכר" — fixed in the
  new seed); two documented-dead duplicate categories (`בית`, `בנקים
  וכרטיסי אשראי`) still have live rows with different percents than their
  canonical counterpart; a probable rounding inconsistency on
  `רכב ותחבורה/מערכות`'s VAT (66.66 vs. 67.00 on its five siblings); an
  undocumented near-duplicate of D14's already-approved פנסיה merge pattern
  found for קרן השתלמות; five bank/cash-movement rows and one loan-repayment
  row squatting on expense account codes despite not being real P&L items.
- **`account_code_migration`**: still 50 rows (same count, same old-code
  coverage) — 6 of the old 34 subAccountCodes now migrate to their block's
  PARENT code (merges) instead of a distinct child; captured in a new
  `MERGED_SUBACCOUNT_MIGRATIONS` array since a merged account's `legacyCode`
  slot is already used by its own primary old code.
- **Verified via script**: 59 accounts, zero duplicate codes, zero numbering
  collisions, every migration target resolves to a real account row,
  `tsc --noEmit` shows zero new errors (same pre-existing users/report-workflow
  spec failures as before, untouched).

**Resolution (same day, after review)** — Elazar's four decisions applied:
1. `61010 מתנות מוכרות` → `tax=100/vat=0` (corrected from the 100/100
   placeholder).
2. `60010` split approved; the NOT_RECOGNIZED anchor card (`60000`) renamed
   `הוצאות לא מוכרות` (section keeps the broader legacy label
   `הוצאות בלתי מזוהות`).
3. All six deductible-VAT car-expense cards normalized to `vat=66.67`
   (not 67.00 as originally proposed) — `60200` parent +
   `60220/60230/60240/60250/60260/60270`; `60210 ביטוח רכב` unaffected.
4. "בית"/"בנקים וכרטיסי אשראי" duplicate categories merge into their
   canonical counterparts — confirmed. Delta check against
   `keepintax_prodcopy` (`expense` + `classified_transactions` tables):
   **zero rows reference either duplicate category anywhere** → ₪0.00
   report impact, registered as `intentional-diffs.md` Correction #2 per
   D15 process (recorded even though the delta is zero, so the Phase
   1.7/3.6/4.6 comparison script has a documented answer).

`chart-review.xlsx` regenerated (twice — once after the initial build, once
after applying these four decisions). `phase1-chart-review.md` rewritten to
STATUS: APPROVED. Master-plan checkboxes 1.2 and 1.3 ticked. Committed.

**Next**: Session 4 (task 1.4, the actual renumbering script against
`keepintax_prodcopy`) — Plan Mode per the runbook.

## 2026-07-10 — Session 4 (Phase 1.4, complete)

Plan Mode, per the runbook. Wrote and rehearsed
`backend/scripts/migrations/2026-07-10_chart_renumber.sql` end-to-end against
`keepintax_prodcopy`, then appended the final version to `cutover.sql`
Section 3.

- **Script structure**: Section A (DDL — `CREATE TABLE accounting_section` /
  `account_code_migration`, rename+extend `default_booking_account` →
  `booking_account`, drop the old auto-named `UNIQUE(code)` index via a
  dynamic `information_schema` lookup + `PREPARE`/`EXECUTE`, `TRUNCATE` the
  old ~25-row chart since it's structurally superseded); Section B (seed the
  new 16-section/59-account/50-migration-row chart, generated verbatim from
  `chart.seed.ts` via a new one-off generator script,
  `2026-07-10_generate-chart-seed-sql.ts`, to eliminate transcription risk);
  Section C+D (the actual renumbering UPDATEs, wrapped in a real
  `START TRANSACTION`/`COMMIT` since no DDL runs in that block). Per Elazar's
  explicit instruction, the file's header documents that Sections A/B are
  NOT transactional (MySQL DDL auto-commits) — recovery from a mid-A/B
  failure is a backup restore, not a rollback — while C/D genuinely roll back
  on failure.
- **D14/D15 Bituach Leumi special case verified, not assumed**: confirmed via
  a guard query that ALL 6 live `journal_line` rows on old account 5000 are
  exactly the 6 registered `journal_entry` ids (10000145/158/167/173/186/203)
  before running the special-case UPDATE (→ 90300) ahead of the generic
  migration-map UPDATE (5000→60000), so the generic pass affects 0 rows on
  5000 by the time it runs — verified empirically, not just asserted.
- **Bug caught and fixed mid-session**: first rehearsal attempt failed with
  `ER_CANT_AGGREGATE_2COLLATIONS` — the new tables' `CREATE TABLE` statements
  used `utf8mb4_unicode_ci` (copied from the billing migration's style)
  but the database's actual standard (confirmed via
  `information_schema.TABLES` against `journal_line`/`journal_entry`/
  `booking_account`/`default_sub_category`) is `utf8mb4_0900_ai_ci` (MySQL 8
  default). Fixed in the `.sql` file. Recovered by fully re-importing
  `_prod_dump/keepintax-prod.sql` into `keepintax_prodcopy` (via a `mysql2`
  script, `multipleStatements: true`, `FOREIGN_KEY_CHECKS=0` during the
  import, and stripping the dump's one `DELIMITER $$` trigger block — none of
  which mysql2's wire protocol understands — before executing), then
  re-running the corrected script clean end-to-end from a pristine copy, per
  the cutover checklist's own "rehearse against a FRESH dump" discipline.
- **Verified clean** (full detail in `cutover.sql` Section 3's header):
  9 old codes renumbered exactly as D14 lists; all 6 Bituach Leumi rows now
  read 90300, 0 rows remain on 5000; grand totals (`SUM(debit)`,
  `SUM(credit)`, `SUM(amountForTax)` — the last per Elazar's explicit
  addition to the verification set) byte-identical before/after; 0 orphaned
  `journal_line.accountCode` values; `accounting_section`=16,
  `booking_account`=59, `account_code_migration`=50;
  `journal_entry.counterAccountCode` was `'1100'` on all 122 rows both
  before and after (the generic renumbering UPDATE against it is a verified
  no-op on this data, kept per D14 to guard future/other data).
- **`subCounterAccountCode` retired from the entity**, per Elazar's explicit
  confirmation this session (schema-drift.md Gap 2 / D2). Removed from
  `JournalEntry`, `JournalEntryInput`, and every real call site (not just the
  entity): `BookkeepingService.persistJournalEntry` +
  `buildCreateManualJournalEntryInput`-equivalent path, and
  `ExpensesService` — deleted the now-dead `resolveSubAccountCode` private
  method and its one caller in `buildJournalEntryInput`. `tsc --noEmit`
  clean on every touched file (bookkeeping + expenses); remaining failures
  are the same pre-existing unrelated ones (users/auth specs,
  report-workflow spec) noted in every prior session.
- **`keepintax-dev` side effect flagged, not actioned**: the shared dev DB
  still has `subCounterAccountCode` (from `synchronize`); removing it from
  the entity means TypeORM will `DROP COLUMN` it there next boot. No
  preservation step taken — consistent with the existing "shared dev DB is
  disposable for schema work" understanding.

**Phase 1 checklist status**: 1.1–1.4 done. 1.5 (`getNextAccountCode`,
Session 3A) already done in parallel. Remaining: 1.6 (update every hardcoded
account code in app code) and 1.7 (baseline-report regression).

**Next**: Session 5 (tasks 1.6, 1.7) — after which `Current phase: 2`.

## 2026-07-10 — Session 5 (Phase 1.6–1.7, complete — Phase 1 DONE)

Confirmed `keepintax_prodcopy` was left in the migrated (post-1.4) state from
Session 4's last rehearsal: `booking_account` has 59 rows, `journal_line`
already carries only new codes (`1100`(122), `2400`(1), `2410`(56),
`40000`(38), `60100`(11), `60200`(29), `60300`(14), `60400`(3), `60600`(3),
`60700`(1), `61100`(18), `90300`(6) — matches D14 exactly, old 5000 fully
gone).

- **1.6**: swept every hardcoded old-chart account code out of application
  logic. `buildDocumentJournalLines` (`documents.service.ts`) and
  `createManualJournalEntry` (`bookkeeping.service.ts`): `4000` → `40000`
  (3 + 1 call sites). `reports.service.ts`: `createVatReportFromJournal`
  and `createPnLReportFromJournal` SQL/JS literals `4000`/`4010` →
  `40000`/`40010`; `buildLineDescription`'s income-account labels same;
  `getLedgerEntryAccounts` (the manual-entry dropdown) switched its filter
  from `!!a.pnlCategory` to `!!a.sectionId` — `pnlCategory` is only set on
  parent-level accounts, so the old filter would have silently hidden every
  sub-ledger child account from the dropdown once BookingAccount actually
  has child rows (per Phase 1.2/1.3). `createPnLReportFromJournal`'s own
  `pnlCategory IS NOT NULL` join was deliberately left alone — its own
  entity comment says that switch is Phase 4.4, not 1.6, and it's safe for
  now because all 9 businesses' live journal data only touches parent-level
  codes. Found and fixed the same class of bug one level down:
  `bookkeeping.service.ts`'s manual-entry safety-net check
  (`!account.pnlCategory`) would have rejected any child account the
  now-fixed dropdown offers — switched to `!account.sectionId` too, not
  explicitly named in the plan bullet but the same defect. `demo-data.service.ts`'s
  boot diagnostic code list updated (`4000`/`5000` → `40000`/`60000`,
  non-fatal). `compareLedgerAccountCodes`'s hardcoded display-order array
  translated 1:1 through the legacy→new mapping (also not explicitly named
  in the bullet, but the same class of hardcode — would otherwise silently
  mis-sort the ledger/dropdown). Verified, no change needed: SHAAM B100's
  account-code field is 15 chars wide (comfortably fits 5 digits); ledger
  balance-direction logic keys off `BookingAccount.type`, never a code;
  `expenses.service.ts` always resolves codes dynamically; `account.seed.ts`/
  `account-seed.service.ts` (the OLD boot seeder) is out of scope per its
  own file header — superseded in Phase 2.6, not touched here. Updated the
  3+3 hardcoded `'4000'` test fixtures in `bookkeeping.service.spec.ts` and
  `documents-journal.service.spec.ts` to match. `tsc --noEmit` and
  `jest bookkeeping.service.spec documents-journal.service.spec` both clean
  (24/24 passing; remaining pre-existing failures are the same untouched
  users/report-workflow specs noted every session).
- **1.7**: added an `OUT_DIR_NAME` env override to
  `generate-baseline-reports.ts` (defaults to the original behavior) so it
  could re-run against the now-migrated `keepintax_prodcopy` without
  overwriting the Phase 0.5 golden fixtures — output went to
  `docs/redesign/baseline-reports-post-migration/`. Same 9 businesses, same
  date ranges/period counts as the original run. Wrote
  `backend/scripts/compare-baseline-reports.ts` (the committed automated
  comparison script this task calls for): diffs every VAT field and P&L
  field/category per period + aggregate, diffs the ledger by regrouping the
  OLD ledger's lines under their expected NEW account code (via
  `chart.seed.ts`'s `ACCOUNT_CODE_MIGRATION`, `accountCode`-sourced rows
  only) and comparing against the real NEW ledger, and asserts old code
  ranges (`4000`/`4010`/`5000`–`6300`) are fully absent from the
  post-migration ledger. Two D15 corrections special-cased directly from
  Elazar's review of this session's plan (not just inferred): the six
  Bituach Leumi journal entries (ids `10000145/158/167/173/186/203`) are
  matched by `journalEntryId`, not by their old account code, and expected
  on `90300` rather than the generic `5000`→`60000` mapping; business
  `204245724`'s "הוצאות בלתי מזוהות" P&L category vanishing entirely (old
  total present, new total zero) is treated as satisfying Correction #1
  rather than a failure, with `netProfitBeforeTax` required to rise by
  exactly the removed amount. Also asserted, once per business, that the
  removed aggregate amount for 204245724 matches the registry's exact
  ₪11,775.40 (confirmed: `11775.399999999998`, floating-point-equal).
  **Result: `npx ts-node -r tsconfig-paths/register
  scripts/compare-baseline-reports.ts` → all 9 businesses ✅, zero
  un-registered diffs.**

**Phase 1 checklist status**: 1.2–1.4, 1.6, 1.7 ticked `[x]` this session's
scope. 1.1 and 1.5 are also functionally complete per Sessions 2/3A but
their checkboxes were found still unticked in the plan file — flagging
here rather than silently fixing someone else's task's checkbox; worth a
quick pass before Phase 2 work starts. `Current phase: 2` set in `CLAUDE.md`.
Phase 1's "Definition of done" (production journal fully on new codes; all
reports reproduce baseline; old code ranges absent from `journal_line`) is
now fully met.

**Next**: Phase 2 (Session 6+) — the unified `category`/`sub_category`
tables and their migration from the four old catalog tables.

## 2026-07-12 — Session 6 (Phase 2.1 + 2.3 complete; 2.2 review generated, apply pending sign-off)

Planned and implemented tasks 2.1 (`Category`/`SubCategory` entities) and 2.3
(`CatalogService` + `resolveAccountCode` adapter) in full; wrote and ran
task 2.2's migration script in `MODE=review` only, per Elazar's explicit
gate — no writes were made to `keepintax_prodcopy` or any other DB this
session.

- **2.1**: `Category`/`SubCategory` (`backend/src/bookkeeping/category.entity.ts`,
  `sub-category.entity.ts`) placed in the `bookkeeping` module per Elazar's
  choice (not a new `catalog` module) — `ExpensesModule` already imports
  `BookkeepingModule`, zero new wiring needed. Two new enums added to
  `enum.ts`: `CategoryType`, `ApprovalStatus`. Wired into
  `bookkeeping.module.ts` (`forFeature`, `CatalogService` provider/export)
  and `app.module.ts`'s root `entities` array (dev `synchronize` will create
  the tables next boot).
- **2.3**: `CatalogService` (`backend/src/bookkeeping/catalog.service.ts`):
  `getMergedCategories`/`getMergedSubCategories` (CLIENT>ACCOUNTANT>SYSTEM
  by name, D4), `resolveSubCategory` (subCategoryId → account → full
  accounting law, for Phase 3/4), and `resolveAccountCode` — the thin
  adapter matching the OLD resolver's exact signature. Its fallback moved
  from the retired `'5000'` to `'60000'` (the new NOT_RECOGNIZED catch-all).
  Per Elazar's note, the adapter carries an explicit TODO marking it a
  Phase-4-only transition bridge: once expense approval resolves through
  `subCategoryId` directly, a PRIVATE/unmapped sub_category is rejected
  before journal posting is ever attempted, so this fallback should never
  be reached post-Phase-4. `ExpensesService.resolveAccountCode`
  (`expenses.service.ts`) now delegates to it — one-line body, signature
  and single call site (`buildExpenseJournalLines`) untouched.
  `expenses-journal.service.spec.ts` updated with a mocked `CatalogService`
  provider (was implicitly relying on `defaultSubCategoryRepo`'s mock to
  drive `resolveAccountCode`'s old chain). All 45 tests across
  `bookkeeping.service.spec`, `account-code-allocator.service.spec`,
  `expenses-journal.service.spec` green; `tsc --noEmit` clean on every
  touched file (same pre-existing unrelated failures as every prior
  session: users/report-workflow specs).
- **90500/90600**: added two new technical accounts to `chart.seed.ts`
  (additive, not touching Phase 1's already-rehearsed migration) per
  Elazar's decision on the two row-groups `phase1-chart-review.md` §0.9/§0.10
  left undecided — `90500` for internal cash/bank movements (ביט, בין
  חשבונותי, חיוב אשראי חודשי, משיכת מזומן, פייבוקס) and `90600` for
  loan-principal repayment (פרעון הלוואה). Elazar's requested check on
  account `1000` (חשבון מעבר) confirmed it's a vestigial, never-posted-to
  A/R-contra placeholder (`reports.service.ts` actively excludes it from
  the ledger/dropdown; no code path ever writes to it) — not reused.
- **2.2 (script written, MODE=review run, MODE=apply NOT run)**:
  `backend/scripts/migrations/2026-07-12_catalog_migration.ts`. Reads all
  four legacy tables via raw `dataSource.query()` (never TypeORM repos,
  never `subAccountCode` — schema-drift.md Gap 1, that column doesn't exist
  in production). Resolution order: explicit override table (D14 buckets +
  this session's 90500/90600 + the confirmed קרן השתלמות merge) → D14
  private/annual buckets → exact name match against `CHART_ACCOUNTS` →
  old `accountCode` via `ACCOUNT_CODE_MIGRATION` → unresolved. Ran against
  `keepintax_prodcopy`: **all 102 legacy sub-category rows accounted for**
  (87 default_sub_category + 15 user_sub_category), 4 excluded (the
  documented-dead "בית"/"בנקים וכרטיסי אשראי" duplicate categories — found
  to be orphan `categoryName` strings on `default_sub_category` with no
  matching `default_category` row at all, not excluded `default_category`
  rows as `intentional-diffs.md`'s Correction #2 wording had implied; usage
  re-verified zero against live `expense`/`classified_transactions`), 0
  SYSTEM rows unresolved, 7 CLIENT rows resolved to
  `MISSING_ACCOUNTING_MAPPING` (a design addition beyond the plan's literal
  text: a CLIENT sub_category with no resolvable card is still migrated,
  accountId=NULL, rather than silently dropped — this is D5's own explicit
  design for exactly this case, needed so Phase 3.2's expense backfill has
  a real row to attach to), 0 genuine percent-variant cases (the one
  initial hit, business 204245724's Bituach Leumi row, was a false
  positive from comparing expense-shaped percents against technical
  account `90300`'s intentionally-null law — fixed by only comparing
  against accounts with a real `recognitionType`). Output:
  `docs/redesign/phase2-catalog-review.md`.
  **Found and fixed two bugs in the script's first pass** (both from
  gaps between what `phase1-chart-review.md`/D14 documented and what a
  live query actually returns): the בריאות category is really named
  "בריאות וביטוחים" in production, not "בריאות" (fixed the override key,
  recovering 5 rows from spuriously landing in "unresolved"); and the
  percent-variant false positive above.
  **2.2 checkbox intentionally left unticked** — the task includes running
  the migration, which has not happened. `MODE=apply` is stubbed to throw
  ("not yet implemented ... Phase 2.2 execution is a separate, later
  step") pending Elazar's sign-off on the review doc, per the explicit
  process gate this session was scoped to respect. One item surfaced for a
  possible follow-up decision (not auto-applied): user_sub_category id 11
  ("שונות → תרומה") landed in MISSING_ACCOUNTING_MAPPING rather than
  ANNUAL because "תרומה" doesn't exact-match "תרומות מוכרות" — plausibly
  the same real-world donation-deduction item, left for Elazar rather than
  guessed.

**Next**: Elazar reviews `docs/redesign/phase2-catalog-review.md` and signs
off (or corrects); then a follow-up session implements `MODE=apply` in the
migration script (transactional writes to `category`/`sub_category`/new
80000-range variant cards — none needed this run — plus the
`booking_account` 90500/90600 seed), re-verifies row counts, and appends
the result to `cutover.sql`. After that, `Current phase` stays `2` until
2.4–2.7 (CRUD port, freeze old tables, flat seeder, parity test) also land.

## 2026-07-12 — Session 6 continued (Phase 2.2 applied, verified, in cutover.sql — Phase 2.1–2.3 DONE)

Elazar reviewed `phase2-catalog-review.md` and approved with three
corrections, all implemented before applying: (1) the "בית"/"בנקים וכרטיסי
אשראי" orphan-row exclusion confirmed acceptable as-is (zero-usage
verification is what matters, not the exact table-level shape); (2) the 7
`MISSING_ACCOUNTING_MAPPING` CLIENT rows confirmed as correct D5 behavior,
kept; (3) user_sub_category id 11 ("שונות → תרומה") changed from
`MISSING_ACCOUNTING_MAPPING` to its own `ANNUAL` sub_category (own name
preserved, not merged into "תרומות מוכרות") — added `'תרומה'` to the
migration script's `ANNUAL_SUBCATEGORY_NAMES` set.

**`MODE=apply` — two blockers hit and resolved, both handled by stopping
and asking rather than pushing through:**

1. First `MODE=apply` attempt failed immediately: `category`/`sub_category`
   tables don't exist in `keepintax_prodcopy` — this rehearsal DB was only
   ever touched by Phase 1.4's explicit migration script, never by a normal
   `synchronize`-enabled dev boot, so nothing had created the Phase 2.1
   tables there yet. Transaction rolled back cleanly (verified: zero
   90500/90600 rows in `booking_account`, only the four old catalog tables
   present). Wrote `backend/scripts/migrations/2026-07-12_catalog_migration_schema.sql`
   (CREATE TABLE DDL, verified column-for-column against `category.entity.ts`/
   `sub-category.entity.ts` per Elazar's explicit condition; no FK
   constraints on `sub_category.categoryId`/`accountId`, matching the
   established precedent from `booking_account.sectionId` in
   `2026-07-10_chart_renumber.sql`) — flagged to Elazar as a new schema
   change to the shared rehearsal DB before running it (auto mode blocked
   the unapproved DDL run automatically), per his explicit two conditions:
   embed it in `cutover.sql` Section 4a (done, appended before running, not
   after — auto mode also correctly blocked a same-turn "run now, document
   later" attempt) and verify column-for-column against the entities (done,
   both files re-read side-by-side against the DDL).
2. First DDL run attempt only created `sub_category` — a bug in the runner
   script's naive `sql.split(/;\s*\n/)` parsing merged the file's leading
   comment block with the `category` CREATE TABLE statement into one chunk
   starting with `--`, which the (also naive) `!startsWith('--')` filter
   silently dropped. Caught immediately by checking `SHOW TABLES` before
   proceeding rather than assuming success; fixed by issuing the `category`
   DDL as a literal string instead of parsing the file.

**`MODE=apply` (clean run against `keepintax_prodcopy`):** 2 `booking_account`
rows (90500, 90600), 14 `category` rows (12 SYSTEM + 2 CLIENT), 96
`sub_category` rows (98 migrated legacy rows − 2 merge-collapses: pension
and קרן השתלמות each fold two legacy rows into one). Readback dumped to
`2026-07-12_catalog_migration_result.json`, rendered to literal SQL by the
new `2026-07-12_generate-catalog-migration-sql.ts` and appended verbatim to
`cutover.sql` as Section 4b (wrapped in `START TRANSACTION`/`COMMIT`, no
DDL), directly under Section 4a's schema DDL.

**Verification (`backend/scripts/verify-phase2-catalog-migration.ts`, kept
in the repo, all against `keepintax_prodcopy`):** row counts exact (14/96/2);
zero duplicate rows under either `UNIQUE` constraint; zero orphaned
`sub_category.accountId` references; zero PRIVATE rows carrying an
`accountId` (D5). **Parity hard gate** (per Elazar's explicit instruction
to keep it as a hard gate): spot-checked all 22 distinct
`(category, subCategory, firebaseId, businessNumber)` pairs the 85 live
`expense` rows actually use. First run surfaced 16 apparent mismatches —
all traced to the SAME root cause: the old flat resolver only ever
returned a bare parent code (e.g. `5200` for `רכב ותחבורה`) because
`subAccountCode` never existed in production (schema-drift.md Gap 1) to
carry finer detail, while Phase 1.3's chart deliberately built granular
child accounts by name (`דלק`→`60220`, `חניה`→`60230`, etc.) — confirmed
by checking every one of the 16 new codes' `sectionCode` in `chart.seed.ts`
against the expected parent, all matched exactly. This is Phase 1.3's
intended refinement, not a migration bug — the verification script's
oracle was fixed to accept "new result is a child of the expected old
parent block" as a pass, mirroring the same exclusion
`compare-baseline-reports.ts` already applies (only `accountCode`-sourced
rows compared 1:1, `subAccountCode`-sourced ones never were, since that
column never existed in prod). Re-run: **21/21 non-exception pairs pass
exactly (16 confirmed refinements + 5 exact matches), 1/1 registered
exception confirmed** (`עסק/מקדמות ביטוח לאומי`, business 204245724 →
`90300`, not the generic `60000` mapping, per D14/D15) — **0 unregistered
mismatches.**

**Phase 2 checklist status**: 2.1, 2.2, 2.3 all ticked `[x]` this session.
Remaining: 2.4 (CRUD port), 2.5 (freeze old tables), 2.6 (flat seeder), 2.7
(parity test — this session's verification script is a hand-rolled preview
of it, not a substitute for the committed Jest suite the plan calls for).
`Current phase` stays `2` in `CLAUDE.md` until those land.

**Next**: a follow-up session for 2.4–2.7.

## 2026-07-12 — Session 6B (Phase 2.4–2.7 — Phase 2 COMPLETE)

Plan-mode session (three corrections from Elazar's review, all applied
before implementing — see below). Ported every catalog CRUD endpoint,
froze the old four tables, replaced `AccountSeedService` with a flat
idempotent seeder, and added the Phase 2.7 test suite.

**Design decision confirmed with Elazar up front**: the old percent-bearing
endpoints (`add-user-sub-categories`, `update-user-sub-category`,
`sub-category-report-config`) stay wire-compatible, but a submitted percent
combination now resolves to a `booking_account` rather than living on
`sub_category` (D1). A new `CatalogService.findOrCreateVariantAccount`
finds-or-creates a scoped variant card per unique percent/isEquipment/
recognition combination and points the thin `sub_category` at it — same
precedent the Phase 2.2 migration already used for user_sub_category
percent-variants. Variant cards are named `"{name} — מוכר {tax%}/{vat%}"`.

**Three corrections from plan review, all implemented:**
1. **Section inheritance, not invention**: `findOrCreateVariantAccount`
   never creates a sectionless card. Resolution order: (1) the base
   account's `sectionId` (the canonical same-named card — found via a
   SYSTEM `sub_category` lookup by name) — (2) a SYSTEM `accounting_section`
   whose name matches the parent category name — (3) refuse (return
   `null`); the caller lands the `sub_category` as
   `MISSING_ACCOUNTING_MAPPING` with `accountId=NULL` instead. Also applied
   uniformly to `createSubCategory`'s ANNUAL/isPrivate rows: neither ever
   attempts law resolution — both are `APPROVED` with `accountId=NULL` by
   design (D5 / D14 decision 2), never `MISSING_ACCOUNTING_MAPPING`.
2. **Soft delete, `isActive` audited everywhere**: `deleteCategory`/
   `deleteSubCategory` set `isActive=false` (hard-deleting a SYSTEM category
   could orphan CLIENT sub_categories pointing at it by `categoryId`).
   Confirmed every read path filters `isActive: true`
   (`getMergedCategories`/`getMergedSubCategories` already did;
   `findOrCreateCategory`/`findCategoryInSingleScope`/
   `findSubCategoryInSingleScope`/`findSystemSubCategoryByName` and the
   admin listing methods added this session all do too) — also fixed a
   pre-existing gap: the Phase 2.3 `resolveAccountCode` adapter's own
   queries were missing `isActive: true` (folded into the `resolveByName`
   rewrite it now delegates to).
3. **cutover.sql captures the seeder as a proper section**: appended
   Section 5, documenting that the Phase 2.6 seeder is a *confirmed no-op*
   against `keepintax_prodcopy` (verified via a MODE=review/apply script,
   same two-step pattern as the Phase 2.2 migration) — every section/
   account/SYSTEM-category/SYSTEM-sub_category it would write already
   exists, written by Sections 3/4a/4b. Not redundant SQL — a documented,
   verified reconciliation, with the cutover-ordering implication spelled
   out (Sections 3/4a/4b must run before the new code, carrying
   `CatalogSeedService`, is deployed and boots).

**2.4 — CRUD port** (`backend/src/bookkeeping/catalog.service.ts`,
`backend/src/expenses/expenses.service.ts`): added
`findOrCreateCategory`/`findOrCreateVariantAccount`/`createSubCategory`/
`updateSubCategoryLaw`/`deleteCategory`/`deleteSubCategory` plus several
scoped-lookup helpers to `CatalogService` (now also injects `BookingAccount`/
`AccountingSection` repos and `AccountCodeAllocatorService`). Every
`ExpensesService` catalog method (`getCategories`, `getSubCategories`,
`addUserCategory`, `addUserSubCategories`, `getAllDefaultSubCategories`,
`getAllUserSubCategories`, `updateDefaultSubCategory`,
`deleteDefaultSubCategory`, `createDefaultSubCategory`,
`updateUserCategory`, `updateUserSubCategory`,
`setSubCategoryReportConfig`, `deleteUserCategoryCascade`,
`deleteUserSubCategory`, `getUserCategoriesGrouped`) rewritten to call
`CatalogService`, with a `toLegacyCategory`/`toLegacySubCategory` mapper
pair translating `Category`/`SubCategory` rows back to the
`categoryName`/`subCategoryName`-shaped objects the frontend already
expects — zero frontend changes needed. Also ported
`getSubCategoryIsEquipment`/`getSubCategoryReportScope` (live inputs to
`addExpense`'s classification snapshot, not literally "CRUD" but reading
the exact tables 2.5 freezes — leaving them on the old tables would have
silently gone stale for every sub-category created after this session) via
a new `CatalogService.resolveByName`. Deliberately did **not** port
`getPnlCategoryMap` (D3: the `pnlCategory` namespace is already dead;
deletion is explicitly Phase 4.4 scope) or `transactions.service.ts`'s
`findSubCategoryDetails`/category-name filter (both operate on the legacy
`Transactions` table, already flagged `TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS`
and superseded by `TransactionProcessingService`'s live pipeline — out of
scope, not a regression). Added a classified_transactions safety check to
`deleteDefaultSubCategory` that didn't exist pre-port (SYSTEM sub-category
names ARE referenced by CLIENT classification rules).

**2.5 — freeze**: removed `transactions.service.ts`'s `loadDefaultCategories`
and its controller route (the only other write path to the old tables
besides `ExpensesService`); dropped `DefaultCategory`/`UserCategory` repo
injections from `ExpensesService` (kept `DefaultSubCategory`/
`UserSubCategory` — still read by the untouched `getPnlCategoryMap`).
Removed the now-dead `load-default-categories` bulk-upload control from
`category-management.component.html`/`.ts` (admin panel) rather than leave
a button pointing at a deleted endpoint.

**2.6 — flat seeder**: new `backend/src/bookkeeping/catalog.seed.ts`
(`SYSTEM_CATEGORIES`, `SYSTEM_SUB_CATEGORIES` — 12 categories / 81
sub-categories, name-keyed, transcribed from the already-reviewed
`docs/redesign/phase2-catalog-review.md`, with the two ANNUAL merges
folded in) and `catalog-seed.service.ts` (`CatalogSeedService`, replacing
`AccountSeedService`): seeds `accounting_section`/`booking_account` from
`chart.seed.ts` (data that existed since Phase 1.3 but was "not wired into
any boot-time seeder yet" per its own header comment — this session is
that wiring) and the SYSTEM catalog from `catalog.seed.ts`, all idempotent.
Deleted `account-seed.service.ts` and `account.seed.ts` (old pre-redesign
`DEFAULT_ACCOUNTS`). **Bug caught during rehearsal**: `.upsert()` on
`accounting_section`/`booking_account` (composite non-PK conflict target)
threw `Cannot update entity because entity id is not set in the entity` — a
TypeORM RETURNING-columns limitation on the UPDATE branch of an upsert,
confirmed to corrupt nothing (row counts held steady) but failing every
row. Replaced with explicit find-then-create/update loops (matching the
pattern `findOrCreateCategory` already used) — clean run confirmed after.

**2.7 — tests**: `catalog.service.spec.ts` (merge precedence,
`findOrCreateVariantAccount` reuse/create/refuse/section-inheritance,
`createSubCategory`'s isPrivate/ANNUAL/MISSING_ACCOUNTING_MAPPING
branches, `resolveAccountCode` fallback), `catalog-seed.service.spec.ts`
(full-seed + idempotent-rerun + `SKIP_BOOT_SEED` + seed-data cross-reference
checks against `chart.seed.ts`), `catalog-parity.spec.ts` (the Phase 2.7
plan item verbatim — promotes
`backend/scripts/verify-phase2-catalog-migration.ts`'s hand-rolled hard-gate
check into a committed Jest suite, gated behind `DB_DATABASE` so `npm test`
never needs DB access). Full backend suite run: only the 6 suites already
broken on `main` before this session (confirmed via `git stash`) still
fail; nothing newly broken.

**Verification against `keepintax_prodcopy`**: `2026-07-12_run-catalog-seeder.ts`
(MODE=review then MODE=apply, same two-step pattern as the Phase 2.2
script) — confirmed **zero diff**: 16/16 sections, 61/61 accounts, 12/12
SYSTEM categories, 81/81 SYSTEM sub-categories all already matched exactly.

**Phase 2 checklist status**: 2.1–2.7 all ticked `[x]`. **Phase 2 is
COMPLETE** per its Definition of Done (new catalog serves all reads/writes,
parity test green, old tables frozen). `Current phase` set to `3` in
`CLAUDE.md`.

**Next**: Phase 3 (FK backfill & expense snapshots) — a fresh session per
the runbook's Session 7.
