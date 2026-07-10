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
