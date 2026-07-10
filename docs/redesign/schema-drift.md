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
