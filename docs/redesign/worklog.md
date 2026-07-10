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
