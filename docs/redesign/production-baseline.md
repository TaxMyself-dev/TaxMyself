# Production baseline — Phase 0.2 / 0.4

Source: `keepintax_prodcopy`, restored from `_prod_dump/keepintax-prod.sql`
(phpMyAdmin dump, generated 2026-07-10 08:47 UTC from `keepintax-prod`, MySQL
8.0.37-google). Queries are the ones specified in `categories-audit.md §8`,
run directly against the restored copy.

This document also folds in D14 (already recorded in the master plan) —
every number below was independently re-verified against the dump rather
than taken on faith, and matches D14 exactly except where noted.

---

## Row counts

| Table | Count | Matches D14 |
|---|---|---|
| `default_category` | 12 | ✅ |
| `default_sub_category` | 87 | ✅ |
| `user_category` | 2 | ✅ |
| `user_sub_category` | 15 | ✅ |
| `expense` | 85 | ✅ |
| `journal_entry` | 122 | ✅ |
| `journal_line` | 302 | ✅ |
| `supplier` | 11 | ✅ |
| `classified_transactions` | 196 | ✅ |

## Orphan pairs (expense classifications with no matching catalog row)

- Vs. global catalog (`default_sub_category`) only: **0 pairs**.
- Vs. global catalog OR the expense's own `user_sub_category`: **0 pairs**.
- Orphaned expense rows: **0**.

Confirms D14: "Zero orphaned expenses." Phase 3.2's orphan-resolution
mechanism will process an empty set on this data — keep the code path
regardless, it guards future production data that may not be this clean.

## Duplicate catalog rows

- `default_sub_category` duplicate `(categoryName, subCategoryName)`: **0**.
- `user_sub_category` duplicate `(firebaseId, businessNumber, categoryName,
  subCategoryName)`: **0**.

Confirms D14: "zero duplicate catalog rows." Both protective UNIQUE
constraints (task 0.4) applied cleanly with no cleanup needed — see
`cutover.sql` §1.

## Live journal account codes (expense-referencing entries only)

Query scoped to `journal_line` joined to `journal_entry WHERE referenceType
= 'EXPENSE'` (12 distinct codes appear across ALL entry types per D14; the
below is the expense-only subset relevant to the Phase 1 renumbering map):

| Code | Count |
|---|---|
| 1100 | 85 |
| 2410 | 56 |
| 5200 | 29 |
| 6100 | 18 |
| 5300 | 14 |
| 5100 | 11 |
| 5000 | 6 |
| 5400 | 3 |
| 5600 | 3 |
| 5700 | 1 |

Full 12-code set across all `journal_entry.referenceType` values (D14,
re-verified): 1100 (122), 2400 (1), 2410 (56), 4000 (38), 5000 (6), 5100
(11), 5200 (29), 5300 (14), 5400 (3), 5600 (3), 5700 (1), 6100 (18). Only
4000 + the eight 5xxx/6xxx codes renumber per D2; 1200 and 4010 have zero
production usage.

## Supplier / rule shadow counts

- `supplier`: 11 rows, 11 distinct `(businessNumber, supplierID)` pairs —
  **no duplicates** (differs from D14's "7 distinct pairs" note; D14 likely
  undercounted or used a different grouping — re-verify if this matters to
  Phase 3.5's supplier backfill, but since there are zero duplicates either
  way, it doesn't change the backfill approach).
- `classified_transactions`: 196 rows, 195 distinct `(userId, billId,
  transactionName)` triples — **one (1) pair collides** across 2 rows.
  Non-blocking (no unique constraint proposed on this table in the plan),
  but worth a manual look before Phase 3.5's backfill treats it as
  1:1-mappable.

## Catalog classification split (D14 confirmation)

- Recognized-and-deductible `default_sub_category` rows still on the
  generic `5000` account fallback: `עסק/ספקים`, `עסק/מקדמות ביטוח לאומי`
  (2 rows) — the second is exactly D15's registered Bituach Leumi case.
- `default_sub_category` rows with `accountCode IS NULL`: **30** — matches
  D14's "30 unmapped default_sub_category rows are all `isRecognized = 0`"
  finding exactly.
- Expense split: 6 rows resolve via a `user_sub_category` override, 79 via
  the global catalog/unmatched — matches D14's "6 on user sub-categories,
  79 on the global catalog" exactly.

## `subCounterAccountCode` distribution

Not run — confirmed absent from production (`journal_entry` has 17
columns, no `subCounterAccountCode`). See `schema-drift.md` Gap 2. This is
D14's already-documented finding, independently reconfirmed via `SHOW
COLUMNS` during the 0.6 audit.

---

## Resolved: duplicate `business.businessNumber` (D12.4)

Not one of the D14/0.4 checks, but surfaced while auditing D12.4 ("Add
`UNIQUE(businessNumber)` on `business` if data allows (verify first)").

`businessNumber = '314719279'` appeared on two distinct `business` rows:
id 5 (`נגרות`, firebaseId `aywY4Mhz90RzzrVU99RswfL2YUs1`, EXEMPT) and id 12
(`פוטובלוק שמואל`, firebaseId `CY2jmdBQ4AYH70BZARRp28j0GIi1`, LICENSED).
Checked every table that could hold dependent data for either row
(`expense`, `journal_entry`, `journal_line`, `documents`,
`extracted_document`, `supplier`, `classified_transactions`,
`user_category`, `user_sub_category`, `bill`, `accountant_task`,
`report_workflow`, `delegation`, `annual_report`, `slim_transactions`,
`full_transactions_cache`) — **zero dependent rows on either side**; both
are empty test/duplicate data, confirming Elazar's read.

**Decision (2026-07-10):** delete id 12, keep id 5. Staged as `cutover.sql`
§2 (`DELETE FROM business WHERE id = 12` + `UNIQUE(businessNumber)`),
rehearsed and verified clean against `keepintax_prodcopy`. Per Elazar's
standing decision, D12 security fixes deploy independently of the main
cutover — this section ships in Session 8, not immediately, but is fully
written and rehearsed now so Session 8 doesn't rediscover it from scratch.

---

## Open items surfaced during Phase 0 (see also `schema-drift.md`)

1. **RESOLVED 2026-07-10.** D15's original "~₪29,645" figure for the six
   `מקדמות ביטוח לאומי` journal entries on business 204245724/account 5000
   didn't match the data (actual: ₪22,645.00 gross debit, ₪11,775.40
   `amountForTax`, the latter being what the P&L report actually sums).
   Elazar approved the corrected figure — see `intentional-diffs.md`
   correction #1 and the updated D15 in the master plan.
2. **`journal_entry.referenceId` nullability** (schema-drift.md Gap 3) —
   entity expects nullable (future MANUAL entries), prod has `NOT NULL`.
   No current data conflict (no MANUAL entries exist yet), proposed to
   defer the `MODIFY ... NULL` to the phase that introduces manual journal
   entries. Needs Elazar's yes/no on timing.
3. **RESOLVED 2026-07-10.** Tooling risk for future baseline regeneration
   (Phases 1.7/3.6/4.6 all regenerate these fixtures): booting the full
   Nest `AppModule` via `NestFactory.createApplicationContext` against
   `keepintax_prodcopy` triggers `AccountSeedService.onModuleInit()`, which
   unconditionally upserts `default_category`/`default_sub_category` rows
   (harmless to the VAT/P&L/ledger figures — confirmed those queries never
   read those tables, and `default_booking_account`, which the P&L join
   does use, is untouched — but it does silently grow
   `default_sub_category`'s row count on every boot). **Fix applied:**
   `AccountSeedService.onModuleInit` now checks `SKIP_BOOT_SEED=true` and
   no-ops immediately if set (see `account-seed.service.ts`); deleted along
   with the whole service in Phase 2.6. `generate-baseline-reports.ts`'s
   usage comment documents running with
   `DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true`.
   Verified: row count stayed at 87 after a real run with the flag set.
   Fallback if `SKIP_BOOT_SEED` ever stops covering every write path:
   re-import the pristine dump immediately before/after regenerating
   baseline reports. Also confirmed (from the boot log, pre-fix) that
   `AccountSeedService`'s `seedSubAccountCodes` step fails outright against
   prod schema (`Unknown column 'subAccountCode'`) — caught/logged,
   non-fatal, consistent with schema-drift.md Gap 1.
4. A first, botched run of `generate-baseline-reports.ts` (before
   `NODE_ENV=production` was set) let TypeORM's `synchronize` partially
   mutate `keepintax_prodcopy`'s schema before crashing. Recovered by
   dropping and fully re-importing the database from the dump file (the
   dump itself was never at risk — it's a static file). Final state
   verified clean (row counts above) before the fixtures in
   `baseline-reports/` were regenerated for real. No production system was
   touched at any point — this was entirely local to `keepintax_prodcopy`.

## Baseline report fixtures

Generated by `backend/scripts/generate-baseline-reports.ts` (task 0.5),
committed at `docs/redesign/baseline-reports/`: one JSON file per business
with journal data (9 businesses), each containing per-period + aggregate
VAT/P&L reports and a full-range ledger report, plus an `index.json`
summary. These are the golden files Phases 1–4 must reproduce.
