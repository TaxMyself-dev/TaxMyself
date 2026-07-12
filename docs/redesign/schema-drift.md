# Schema drift audit — Phase 0.6

Source of truth for this audit: `SHOW COLUMNS` / `SHOW INDEX` run directly
against `keepintax_prodcopy`, a database restored from
`_prod_dump/keepintax-prod.sql` (phpMyAdmin dump, generated 2026-07-10
08:47 UTC from `keepintax-prod`, MySQL 8.0.37-google). This is the actual
production schema/data at dump time — querying it directly is equivalent to
having Elazar run the queries against production and is what was done here,
since the full dump was already available locally.

Tables audited (per plan 0.6): `default_category`, `default_sub_category`,
`user_category`, `user_sub_category`, `expense`, `journal_entry`,
`journal_line`, `default_booking_account`, `supplier`,
`classified_transactions`, `extracted_document`, `business`, `delegation`,
`user`.

Row counts and account-code usage were cross-checked against D14 during
import and matched exactly (see `production-baseline.md`).

---

## Clean (no drift): 9 of 14 tables

`default_category`, `user_category`, `user_sub_category`, `journal_line`,
`default_booking_account`, `supplier`, `classified_transactions`,
`delegation`, `user` — every entity column/type/nullability and every
declared `@Index`/`@Unique` matches prod's `SHOW COLUMNS`/`SHOW INDEX`
exactly (index names, column order, and uniqueness all match, e.g.
`Supplier`'s `uq_supplier_business_supplierid` and
`ClassifiedTransactions`'s `IDX_rule_user_bill_merchant`).

---

## Gaps found: 5 tables

### Gap 1 — `default_sub_category.subAccountCode` doesn't exist in prod

- Entity `backend/src/expenses/default-sub-categories.entity.ts:58` declares
  `subAccountCode: string | null` (`varchar(10)`, nullable), populated by
  `AccountSeedService.seedSubAccountCodes`.
- Prod's `default_sub_category` has 13 columns, ending at `accountCode` —
  no `subAccountCode` column exists.
- **This is the D2 "sub_account_code (5101–6201)" concept** — same
  never-migrated-to-prod pattern as Gap 2 below.
- **Decision (per D2, already final):** retired. Remove the column from the
  entity in Phase 1/2 when `booking_account` replaces it — do NOT add it to
  prod. No migration needed for this column specifically (nothing to carry
  forward from a column that was never populated in production).

### Gap 2 — `journal_entry.subCounterAccountCode` doesn't exist in prod

- Entity `backend/src/bookkeeping/jouranl-entry.entity.ts:73` declares it,
  nullable.
- Prod's `journal_entry` has 17 columns; `subCounterAccountCode` is absent
  (confirms D14's documented finding — error 1054 on that column in prod).
- **Decision (already final, D14/plan 1.4):** remove from the entity, do
  NOT add to prod. In dev DBs where the column exists (from `synchronize`),
  derive the new account from it where non-null before dropping (Phase 1.4);
  production has nothing to derive from — never create it there.

### Gap 3 — `journal_entry.referenceId`: entity `bigint`/nullable vs prod `int NOT NULL`

- Entity: `@Column({ type: 'bigint', nullable: true })`.
- Prod: `referenceId int NOT NULL`.
- Checked prod data: only two `referenceType` values currently exist
  (`EXPENSE`: 85 rows, ids 1–72712685; `RECEIPT`: 37 rows, ids 70001–70008).
  Max value 72,712,685 fits comfortably in signed `int` (max ~2.1B) — `int`
  is not undersized. No rows with `referenceId = 0` (no NULL-surrogate
  pattern in use). No `MANUAL` entries exist yet in prod, which is exactly
  the case the entity's `nullable: true` anticipates (D9/D11 manual journal
  entries have no source document → `referenceId` must be NULL then).
- **Decision needed from Elazar:** the type itself (`int` vs `bigint`)
  doesn't need to change — nothing in this schema will exceed `int` range.
  But nullability does: once MANUAL entries ship (Phase 4/5 per D9), prod's
  `NOT NULL` constraint will reject them. Proposed: keep `int`, add
  `ALTER TABLE journal_entry MODIFY referenceId int NULL` to `cutover.sql`
  in the phase that introduces manual entries (not blocking for Phase 0/1).
  Flagging now per rule 5 rather than silently deciding.

### Gap 4 — `expense.source_document_id`: prod has an index the entity doesn't declare

- Prod has `ix_expense_source_doc` (non-unique, single-column on
  `source_document_id`).
- `backend/src/expenses/expenses.entity.ts` declares the column
  (`@Column({ name: 'source_document_id', ... })`) but no `@Index`.
- **Risk:** with `synchronize: true` in dev (`app.module.ts`), TypeORM
  reconciles indexes against entity metadata on every boot. An index that
  exists in the DB but isn't declared on the entity is a candidate for being
  dropped by `synchronize` — this is a plausible mechanism behind the
  known "shared dev DB synchronize thrash" (columns/indexes dropping
  intermittently on `keepintax-dev`).
- **Decision:** add `@Index('ix_expense_source_doc', ['sourceDocumentId'])`
  to the entity (class-level, matching prod's literal name) as one of the
  Phase 0.3-adjacent hygiene fixes — cheap, no schema change, stops
  `synchronize` from treating this index as unknown. Not urgent enough to
  block Phase 0, but should land before further dev-schema churn.

### Gap 5 — `extracted_document`: two prod indexes missing from the entity, and the three declared indexes are unnamed

- Prod has 5 non-primary indexes: `uq_extracted_document_file_subindex`
  (unique, `drive_file_id`+`sub_index`), `ix_extracted_document_user_business_month`
  (`user_id`+`business_number`+`month`), `ix_extracted_doc_matched_tx`
  (`matched_transaction_id`), `ix_extracted_document_paired_with`
  (`paired_with_document_id`), `IDX_extracted_document_biz_md5`
  (`business_number`+`drive_file_md5`).
- Entity (`backend/src/documents/extracted-document.entity.ts:66-75`)
  declares only 3, and all **unnamed**:
  `@Index(['userId','businessNumber','month'])`,
  `@Index(['driveFileId','subIndex'], { unique: true })`,
  `@Index(['businessNumber','driveFileMd5'])`.
- Two prod indexes (`ix_extracted_doc_matched_tx`,
  `ix_extracted_document_paired_with`) have **no entity declaration at
  all**.
- **Risk, same synchronize-thrash mechanism as Gap 4, worse here:**
  unnamed `@Index()` decorators get TypeORM-generated hash names
  (`IDX_<hash>`) that do not match prod's literal names
  (`ix_extracted_document_user_business_month` etc.). Under `synchronize`,
  a name mismatch on structurally-identical indexes is exactly the
  drop/recreate loop the memory note describes — this table is the most
  likely repeat offender.
- **Decision:** name all 5 indexes explicitly in the entity, matching
  prod's literal names exactly (including the two currently undeclared
  ones), as part of the same hygiene pass as Gap 4.

### Gap 6 (minor, non-blocking) — `business.taxReportingType` default mismatch

- Entity default: `TaxReportingType.DUAL_MONTH_REPORT`.
- Prod column default: `NOT_REQUIRED`.
- Every current write path sets `taxReportingType` explicitly (confirmed:
  no NULL/default-reliant inserts observed in the dump), so this has not
  caused a live bug. Flagging for completeness only — **no action required
  for Phase 0**; worth aligning the entity default to prod's `NOT_REQUIRED`
  whenever that entity is next touched, so a future code path that omits
  the field doesn't silently diverge from prod behavior.

### Gap 7 (INCIDENT, 2026-07-12) — accidental `synchronize=true` boot against `keepintax_prodcopy` dropped several unnamed unique/secondary indexes

- **What happened:** Elazar booted the backend against `keepintax_prodcopy`
  without `NODE_ENV=production` (so `synchronize: process.env.NODE_ENV !==
  'production'` evaluated `true`). Synchronize failed on
  `feezback_webhook_events` — `Duplicate entry '' for key PRIMARY` — and was
  retried a couple of times before being stopped manually.
- **Root cause of the crash — CORRECTED after the re-import (see below):**
  the first pass of this audit found NO `id` column at all on
  `keepintax_prodcopy`'s `feezback_webhook_events` and concluded this was a
  pre-existing entity/prod mismatch the incident merely failed to fix. **That
  was wrong.** A fresh re-import of `_prod_dump/keepintax-prod.sql` (ground
  truth) shows real production's `feezback_webhook_events` DOES have
  `id CHAR(36) NOT NULL PRIMARY KEY` populated with real UUID values for all
  1188 rows, and the entity's
  (`backend/src/feezback/webhook/entities/feezback-webhook-event.entity.ts:12`)
  `@PrimaryGeneratedColumn('uuid') id: string` matches it — **there is no
  entity/prod mismatch on this column.** What actually happened: synchronize
  decided the existing `id` column needed rebuilding — plausibly a
  default/generation-strategy mismatch between `@PrimaryGeneratedColumn('uuid')`
  (which some TypeORM versions associate with a column default/generation
  expression) and prod's plain `char(36) NOT NULL` column with no default —
  and NOT a collation issue (every string column on this table, including
  `id`, already shares the same `utf8mb4_unicode_ci`, so collation doesn't
  differentiate why only `id` was targeted). While rebuilding the column,
  MySQL populated the (briefly) defaultless `NOT NULL` column with `''` for
  all existing rows before the `PRIMARY KEY` constraint could be
  re-established, so all 1188 rows collided on `''` → the reported error.
  The net effect on the pre-re-import DB: **the id column and its 1188 real
  UUID values were removed** (not "never added") — confirmed real data loss
  on this table, not merely a failed no-op. The exact TypeORM trigger
  mechanism is not fully proven (would need synchronize's generated SQL log,
  which wasn't captured) but is not relevant to the resolution — re-import
  restored the original column and its values exactly, see below. This is
  a **NEW** finding, not a Phase 0.6 gap (this table postdates that audit).
- **Confirmed collateral damage — real, not hypothetical:** synchronize's
  index-reconciliation pass runs (and apparently commits, index-DDL
  statement by index-DDL statement, before the fatal column-ALTER was ever
  reached) across the whole schema, not just the table it eventually failed
  on. Live `SHOW INDEX` after the incident, verified against the exact
  constraint names our own migration scripts created
  (`2026-07-10_chart_renumber.sql`, `2026-07-12_catalog_migration_schema.sql`
  / `cutover.sql` Sections 3/4a), shows FIVE tables lost secondary indexes
  synchronize could not (or did not get to) recreate:
  - `booking_account` — lost `uq_booking_account_owner_code`
    (`UNIQUE(chartOwnerKey, code)`). Only `PRIMARY(id)` remains.
  - `accounting_section` — lost `uq_accounting_section_owner_code`
    (`UNIQUE(chartOwnerKey, code)`). Only `PRIMARY(id)` remains.
  - `category` — lost `uq_category_owner_name_type`
    (`UNIQUE(chartOwnerKey, name, type)`). Only `PRIMARY(id)` remains.
  - `sub_category` — lost `uq_sub_category_owner_category_name`
    (`UNIQUE(chartOwnerKey, categoryId, name)`) AND both plain indexes
    `idx_sub_category_categoryId`, `idx_sub_category_accountId`. Only
    `PRIMARY(id)` remains.
  - `extracted_document` — lost ALL FIVE of its Gap 5 baseline indexes
    (`uq_extracted_document_file_subindex`,
    `ix_extracted_document_user_business_month`,
    `ix_extracted_doc_matched_tx`, `ix_extracted_document_paired_with`,
    `IDX_extracted_document_biz_md5`). Only `PRIMARY(id)` remains. This is
    exactly the drop/recreate failure mode Gap 5 predicted ("under
    `synchronize`, a name mismatch on structurally-identical indexes is
    exactly the drop/recreate loop... this table is the most likely repeat
    offender") — it has now actually happened.
  - By contrast, `account_code_migration`'s unique constraint on `oldCode`
    (originally created as `uq_account_code_migration_oldCode`) survived,
    but was renamed to a TypeORM-hash name (`IDX_89479a368efc1588525ec6399c`)
    — structurally intact, cosmetic name change only. `supplier` and
    `classified_transactions` were untouched because their `@Index()`
    decorators are already explicitly named in the entity to match prod's
    literal names (`uq_supplier_business_supplierid`,
    `IDX_rule_user_bill_merchant`) — no mismatch, nothing to drop. This is
    the same mechanism the Gap 4/Gap 5 write-ups already warned about,
    generalized: **any unnamed `@Unique()`/`@Index()` decorator whose table
    was created via hand-written migration SQL with a human-chosen
    constraint name is at risk under an accidental `synchronize` run.**
- **Data integrity — corrected:** row *counts* on every table checked
  (redesign-critical tables + `feezback_webhook_events` + the four legacy
  catalog tables) matched the known baseline exactly — no rows added or
  deleted. But `feezback_webhook_events` DID lose real column data (all
  1188 rows' `id` UUID values, per the corrected root-cause above) — this
  incident is **not** purely index/constraint-only as the first pass of
  this audit concluded; one table had an actual data-bearing column
  removed. `id` is not referenced by any FK from another table (confirmed:
  no other table joins to `feezback_webhook_events.id`; the webhook
  processing/dedup logic keys off `payload_hash`, whose index survived
  throughout), so this was very likely operationally harmless — but it was
  real loss, not a close call. Separately, the missing `UNIQUE` constraints
  on `booking_account`/`accounting_section`/`category`/`sub_category`/
  `extracted_document` meant the DB no longer enforced the invariants
  Phase 2.2/2.6's migration and seeder scripts (and the Phase 2.7 test
  suite) were verified against.
- **Not exhaustively verified (why re-import, not a hand patch):** 22
  tables in the database had zero secondary indexes at incident time; only
  the 5 above were individually cross-checked against a known "should have
  an index" baseline (our own migration DDL, or this file's original Gap 5
  findings). The other ~17 (`business`, `child`, `clients`, `expense`,
  `income`, `journal_entry`, `journal_line`, `transactions`, `user`, etc.)
  were not individually re-verified against their entities for this
  incident. Re-importing sidesteps needing to — see Resolution below.
- **Codebase-wide audit for the same pattern:** searched every `@Unique()`/
  `@Index()` decorator in `backend/src` (46 hits). Found exactly one more
  unnamed decorator outside the 5 above: `Transactions/source.entity.ts`'s
  `@Unique(['userId', 'sourceName'])`. Live `keepintax_prodcopy` (pre
  re-import) had NO matching index at all for it either — ambiguous at the
  time whether that was incident damage or pre-existing drift (no Phase 0.6
  baseline covered this table). The re-import resolved the ambiguity: the
  fresh dump's real constraint name is `IDX_source_userId_sourceName` — now
  named explicitly in the entity to match. Every other decorator in the
  codebase was already explicitly named (this appears to be an established,
  consistently-followed convention everywhere except the 6 tables this
  incident/audit touched).
- **RESOLUTION (executed 2026-07-12, approved by Elazar):**
  1. Named all 6 affected `@Unique()`/`@Index()` decorators explicitly,
     matching production's literal constraint names exactly:
     `category.entity.ts`, `sub-category.entity.ts` (plus its 2 previously
     -undeclared plain FK indexes), `account.entity.ts`,
     `accounting-section.entity.ts`, `extracted-document.entity.ts` (all 5
     of its indexes, 2 of which had no prior entity declaration at all —
     finally implementing Gap 5's original decision), `source.entity.ts`,
     and `account-code-migration.entity.ts` (survived the incident but was
     silently renamed — pinned now for the same reason).
  2. Implemented the boot-time safety valve in `app.module.ts` (see
     "Process fix" below).
  3. `keepintax_prodcopy` re-imported fresh from
     `_prod_dump/keepintax-prod.sql`, then `2026-07-10_chart_renumber.sql`,
     `2026-07-12_catalog_migration.ts` (MODE=apply), and
     `2026-07-12_run-catalog-seeder.ts` (MODE=apply) re-run in that order —
     all three reproduced their original results exactly (same row counts,
     same "confirmed no-op" seeder result).
  4. Full verification chain re-run and green: `compare-baseline-reports.ts`
     (all 9 businesses, zero un-registered diffs vs. the Phase 0.5 golden
     fixtures), `verify-phase2-catalog-migration.ts` (21/21 parity pairs +
     1 registered exception, 0 unregistered mismatches), and a fresh
     `SHOW INDEX` sweep confirming all 6 previously-lost/renamed constraints
     are now present under their correct names.
  5. `keepintax_prodcopy` is confirmed back to the exact pre-incident state
     (data-wise) with the constraint-naming root cause fixed, so this exact
     failure mode cannot silently recur.
- **Process fix — DONE:** `app.module.ts` now throws before TypeORM ever
  opens a connection if `synchronize` would be enabled
  (`NODE_ENV !== 'production'`) AND `DB_DATABASE` matches `/prod/i` — the
  exact scenario that caused this incident (`backend/.env`'s `DB_DATABASE`
  defaults to `keepintax_prodcopy`, so an entirely ordinary boot without
  `NODE_ENV=production` was enough to trigger it; there is no other
  guardrail against that).

---

## Decisions requiring no further action (already resolved by the plan)

Gaps 1 and 2 are both instances of the same pattern the plan already
anticipated in D2/D14: an old sub-ledger column that TypeORM's `synchronize`
added in dev but was never migrated onto production. Both are superseded by
`booking_account` in Phase 1/2 — remove from entities, never add to prod.

## Open item for Elazar

- **Gap 3** (`journal_entry.referenceId` nullability): needs a yes/no on
  timing — fold the `MODIFY ... NULL` into Phase 0/1's cutover.sql now
  (cheap, unblocks nothing today since no MANUAL entries exist yet), or
  defer to whichever phase actually introduces manual journal entries
  (D9/D11, Phase 4-5)? Recommendation: defer — no functional need yet, and
  deferring keeps `cutover.sql` sections aligned with the phase that
  actually needs them.

No Phase 1+ migration script has been written yet; this document is
complete as required by plan rule 5 / task 0.6's definition of done.
