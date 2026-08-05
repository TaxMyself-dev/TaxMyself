# Audit report — `keepintax_prodcopy` after accidental `synchronize=true` boot

2026-07-12. Read-only forensic audit only — no fixes applied, no DB writes
made. Performed via a raw `mysql2` connection deliberately bypassing
NestJS entirely, so the audit itself could not trigger another synchronize
run. Full technical detail (exact constraint names, root-cause mechanism)
lives in `docs/redesign/schema-drift.md` Gap 7 and the incident entry in
`docs/redesign/worklog.md`; this file is the standalone summary.

## Incident

Elazar booted the backend normally (no explicit `NODE_ENV` override) while
`backend/.env`'s `DB_DATABASE` happened to be pointed at
`keepintax_prodcopy` — this silently enabled TypeORM `synchronize`
(`synchronize: process.env.NODE_ENV !== 'production'`) against the
rehearsal DB. It failed on `feezback_webhook_events` ("Duplicate entry ''
for key PRIMARY") and was retried a couple of times before being stopped
manually.

## 1. Row-count audit — all clean

| table | expected | found |
|---|---|---|
| expense | 85 | **85** |
| journal_entry | 122 | **122** |
| journal_line | 302 | **302** |
| category | ~14 | **14** |
| sub_category | ~96 | **96** |
| booking_account | ~61 | **61** |
| accounting_section | 16 | **16** |
| account_code_migration | 50 | **50** |

Also checked supplier (11), classified_transactions (196),
extracted_document (33), and all four legacy catalog tables — every count
matches the known baseline exactly. **No data was added, deleted, or
corrupted anywhere**, and the DB has exactly 46 tables, all recognized (no
stray tables from a partial sync).

## 2. Schema audit — real, confirmed damage on 5 tables

Columns are untouched everywhere checked (expense, journal_entry,
journal_line, supplier, classified_transactions, extracted_document, the 4
legacy catalog tables — all byte-for-byte match their entities/our
migration DDL). **But indexes are a different story.** `SHOW INDEX`
confirms these tables lost secondary indexes that our own migrations
created:

- **`booking_account`** — lost `uq_booking_account_owner_code`
  (`UNIQUE(chartOwnerKey, code)`). Only `PRIMARY` remains.
- **`accounting_section`** — lost `uq_accounting_section_owner_code`. Only
  `PRIMARY` remains.
- **`category`** — lost `uq_category_owner_name_type`. Only `PRIMARY`
  remains.
- **`sub_category`** — lost `uq_sub_category_owner_category_name` **and**
  both plain indexes on `categoryId`/`accountId`. Only `PRIMARY` remains.
- **`extracted_document`** — lost **all five** of its pre-existing
  production indexes (the ones schema-drift.md's Gap 5 already flagged as
  at-risk back in Phase 0.6). Only `PRIMARY` remains.

Mechanism: these tables' unique constraints were hand-named in our
migration SQL (e.g. `uq_category_owner_name_type`), but the entities
declare unnamed `@Unique()`/`@Index()`. Synchronize computes its own hash
name, sees a mismatch, drops the old one — and its index-drop pass
apparently ran (and committed, statement by statement) across the schema
*before* the fatal ALTER on `feezback_webhook_events` halted the whole
process. The recreate step never ran. `supplier` and
`classified_transactions` survived untouched because their indexes are
explicitly named to match; `account_code_migration`'s survived too but got
silently renamed to a TypeORM hash name (structurally intact, cosmetic
only).

The other ~17 tables with zero secondary indexes were **not** individually
re-verified against their entities (most likely just never had one —
normal) — that gap in verification is itself part of why re-import is
recommended below.

## 3. `feezback_webhook_events` — CORRECTED after re-import

**This section was wrong in the original audit and is corrected here.**
The original pass found no primary key on the live (incident-affected)
table and concluded this was a pre-existing entity/prod mismatch the
incident merely failed to fix. A fresh re-import of
`_prod_dump/keepintax-prod.sql` (ground truth) disproves that: real
production's `feezback_webhook_events` has `id CHAR(36) NOT NULL PRIMARY
KEY`, populated with real UUID values for all 1188 rows — it matches the
entity's `@PrimaryGeneratedColumn('uuid') id` exactly. **There is no
entity/prod mismatch on this column.**

What actually happened: synchronize decided the existing `id` column
needed rebuilding (root cause not fully proven — a default/generation
-strategy mismatch on `@PrimaryGeneratedColumn('uuid')` is the leading
theory; collation was ruled out, since every string column on this table,
`id` included, already shares one collation). While rebuilding, MySQL
populated the briefly-defaultless `NOT NULL` column with `''` for all
existing rows before the `PRIMARY KEY` constraint could be re-established
— all 1188 rows collided on `''`, producing the reported error. Net
effect: **the id column and its 1188 real UUID values were actually
removed**, not merely "failed to be added." `id` isn't referenced by any
FK from another table, so this was very likely operationally harmless —
but it was real data loss, not a close call. The re-import (below) restored
it exactly.

## 4. Verdict: re-import, don't patch — APPROVED AND EXECUTED

This wasn't ambiguous — the index loss on `category`/`sub_category`/
`booking_account`/`accounting_section`/`extracted_document` was confirmed,
not suspected. Given 22 tables showed zero secondary indexes and only 5
were individually cleared against a known baseline, something similar
elsewhere couldn't be ruled out without checking every entity by hand.
Elazar approved re-import plus two additions: fix the entity-naming root
cause codebase-wide (not just patch symptoms), and add a boot-time guard.

## 5. Root-cause fix (entity naming + boot guard)

Audited every `@Unique()`/`@Index()` decorator in `backend/src` (46 hits).
Found and named 6 that were unnamed and thus at risk of exactly this
drop/never-recreate failure mode: `category`, `sub_category` (plus 2
indexes that had no entity declaration at all), `booking_account`,
`accounting_section`, `extracted_document` (all 5 of its indexes, 2 with
no prior declaration — finally implementing schema-drift.md Gap 5's
original decision), `account_code_migration` (survived the incident but
was silently renamed — pinned too), and one more found by the grep outside
the original 5: `source.entity.ts` (`Transactions` module) — its real
name, `IDX_source_userId_sourceName`, was only discoverable after the
re-import (first guess was wrong, corrected once ground truth existed).
Every other decorator in the codebase was already explicitly named — these
6 tables (created via hand-written migration SQL with human-chosen names,
or in `source`'s case some other historical path) were the exceptions.

Also implemented the flagged safety valve: `backend/src/app.module.ts` now
throws — before TypeORM ever opens a connection — if synchronize would be
enabled AND `DB_DATABASE` matches `/prod/i`. This is the exact condition
that caused the incident and had no other guard.

## 6. Re-import + re-run + verification — all green

1. **Re-import**: `DROP DATABASE` + fresh restore from
   `_prod_dump/keepintax-prod.sql` (not just the dump's own per-table
   drop/create, so no stale redesign-only tables survived). 42 tables
   restored, every D14 baseline row count exact,
   `default_booking_account` present pre-rename — confirmed pristine.
2. **`2026-07-10_chart_renumber.sql`** re-run clean: old codes gone, all 6
   Bituach Leumi lines read 90300, every posted code resolves, counts
   exactly 16/59/50 as before.
3. **`2026-07-12_catalog_migration.ts`** MODE=apply re-run clean: same
   shape as the original — 2 new `booking_account` rows, 14 `category`, 96
   `sub_category`. Row ids differ (fresh AUTO_INCREMENT) but content is
   identical.
4. **`2026-07-12_run-catalog-seeder.ts`** MODE=review then MODE=apply:
   same confirmed no-op as the original rehearsal — 16/16, 61/61, 12/12,
   81/81.
5. **Full verification**: `compare-baseline-reports.ts` — all 9 businesses,
   zero un-registered diffs against the Phase 0.5 golden fixtures.
   `verify-phase2-catalog-migration.ts` — 21/21 parity pairs + 1 registered
   exception, 0 unregistered mismatches, identical to the pre-incident
   result. Fresh `SHOW INDEX` sweep — all 6 constraints back under their
   correct, now entity-pinned names.

## 7. Documentation

- `docs/redesign/schema-drift.md` Gap 7 — full incident writeup, corrected
  `feezback_webhook_events` root cause, and the resolution record.
- `docs/redesign/worklog.md` — incident entry (corrected) plus a RESOLVED
  continuation entry with the full re-import/re-run/verification record.
- This file — standalone summary, updated to match.

## Status

**Resolved.** `keepintax_prodcopy` confirmed back to the exact pre-incident
state, root cause fixed at the entity level (6 tables), boot-time guard in
place. Proceeding to Phase 3.
