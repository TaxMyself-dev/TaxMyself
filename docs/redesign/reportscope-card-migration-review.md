# reportScope model change — review doc (2026-07-14, REVISED)

Status: **code changes complete, MODE=apply NOT yet run against
`keepintax_prodcopy`.** Per the Phase 2.2-style process this instruction
asked for: review doc first, then apply, then `cutover.sql`. This doc is
that review gate.

**Revision note**: Elazar approved the account codes (61340–61380) but
rejected the original `recognitionType: NOT_RECOGNIZED` proposal — see
"New ANNUAL cards" below for the correction (`RecognitionType` gains a
third value, `NOT_APPLICABLE`, now used on both the five ANNUAL cards and
the six TECHNICAL cards). This revision folds that correction in
end-to-end (enum, seed data, DDL, migration script, frontend). MODE=apply
is still not run — awaiting explicit go-ahead on this revised doc.

## What changed

`sub_category.reportScope` is retired. `booking_account.reportScope`
(`enum('pnl','annual','technical')`, `NOT NULL DEFAULT 'pnl'`) replaces it
— matching D1's "accounting law lives on the card" principle exactly (the
same move D1 already made for vat%/tax%/isEquipment/reductionPercent/
recognitionType back on 2026-07-10).

- `PNL` — the default; every income/expense/balance-sheet card that isn't
  one of the two buckets below.
- `TECHNICAL` — the six existing 90100–90600 balance/clearing accounts.
  Previously excluded from P&L only *implicitly* (their `sectionId IS
  NULL` drops them out of `createPnLReportFromJournal`'s INNER JOIN to
  `accounting_section`) — now explicit.
- `ANNUAL` — **new.** Real cards for the five sub_categories that
  previously had `accountId = NULL` + a sub_category-level
  `reportScope = ANNUAL` marker (D14 decision 2). Those sub_categories now
  point at a real card instead.

`CatalogService.resolveSubCategory`/`resolveByName`, the expense snapshot
(`expense.reportScope`, still a real column — a snapshot of the resolved
card's value, same as `expense.vatPercentSnapshot` etc.), and
`createPnLReportFromJournal` all read/filter on the account's
`reportScope` now.

## Code changes made (this session, all committed to the working tree, not yet to a git commit)

- `backend/src/enum.ts` — `ExpenseReportScope` gains `TECHNICAL = 'technical'`.
- `backend/src/bookkeeping/account.entity.ts` — `+reportScope` column.
- `backend/src/bookkeeping/sub-category.entity.ts` — `-reportScope` column.
- `backend/src/bookkeeping/chart.seed.ts` — `SYSTEM_DEFAULTS.reportScope =
  PNL`; the six 90100–90600 rows get an explicit `reportScope: TECHNICAL`
  override; five new `CHART_ACCOUNTS` rows (see table below).
- `backend/src/bookkeeping/catalog.seed.ts` — the five ANNUAL
  `SYSTEM_SUB_CATEGORIES` rows now carry `accountCode` (pointing at their
  new card) instead of the retired `reportScope: ANNUAL` marker.
- `backend/src/bookkeeping/catalog-seed.service.ts` — stopped passing
  `reportScope` into `createSubCategory` (field no longer exists).
- `backend/src/bookkeeping/catalog.service.ts` —
  `ResolvedSubCategory.reportScope` now sourced from `account?.reportScope`
  (defaults `PNL` when there's no account); `createSubCategory` no longer
  special-cases `isAnnual` — an ANNUAL row is now just a normal `accountId`
  pointer, same code path as any other mapped sub_category (this deleted
  more code than it added); `getCatalogOverview` reads
  `s.account?.reportScope`; `findOrCreateVariantAccount` inherits
  `reportScope` from its base account; `updateAccountFields`/
  `listAccountsForAdmin` (the "כרטיסים" admin screen, in-flight from an
  earlier uncommitted session) expose/accept `reportScope` too, so an admin
  can fix a miscategorized card directly.
- `backend/src/expenses/expenses.service.ts` — `applyClassificationToExpense`
  and `getSubCategoryReportScope` read `resolved.reportScope` (the account)
  instead of `sub.reportScope`; every `createSubCategory` call site dropped
  its now-nonexistent `reportScope` argument; `updateDefaultSubCategory`/
  `updateUserSubCategory` no longer write to a `sub_category.reportScope`
  that doesn't exist; `setSubCategoryReportConfig`'s `reportScope` input is
  now accepted-but-ignored (mirrors the existing `pnlCategory` precedent in
  the same method — see its docstring) since changing an expense's report
  routing for real now means repointing the sub_category at a different
  card (D10), not flipping a flag.
- `backend/src/reports/reports.service.ts` — `createPnLReportFromJournal`'s
  account join adds `AND dba.reportScope = 'PNL'`, a second, explicit guard
  alongside the existing `sectionId IS NOT NULL` join (belt-and-braces —
  the task spec explicitly asked for this even though today every
  ANNUAL/TECHNICAL card also has `sectionId = NULL`, which already excludes
  them).
- DTOs: `CreateUserSubCategoryDto`/`UpdateUserSubCategoryDto` lost
  `reportScope` (dead field); `UpdateAccountDto` gained it (admin
  correction tool).
- Frontend: `category-management.component` (admin SYSTEM sub-category
  screen) — the "סוג דוח" `p-select` removed from both the edit and add
  dialogs (closes the review-doc question from the last session); the
  table column and Excel export stay, now reading the card's reportScope
  via the legacy shape's `reportScope` field (unchanged wire key, new
  source). The card picker (`accountPickerItems`) tags non-PNL cards with
  `[רווח והפסד / דוח שנתי בלבד / טכני]` so an admin can tell them apart
  when picking. `card-management.component` (the in-flight "כרטיסים" admin
  screen) gained a matching column + edit control.
- Tests: `catalog.service.spec.ts`'s `ANNUAL reportScope never resolves an
  account` test replaced with a test that an explicit `accountId` is
  pointed at directly (the behavior that test was actually protecting no
  longer exists as a special case). `ResolvedSubCategory`-shaped mocks in
  `expense-classification.spec.ts` / `expenses-journal.service.spec.ts`
  moved `reportScope` to the top level, matching the real interface.

## New ANNUAL cards — codes approved, recognitionType corrected

Five new SYSTEM `booking_account` rows, `type: 'expense'`, `sectionId:
null`, `vatPercent/taxPercent/reductionPercent: 0`, `isEquipment: false`,
`reportScope: ANNUAL`:

| code | name | recognitionType |
|---|---|---|
| 61340 | תרומות מוכרות | NOT_APPLICABLE |
| 61350 | ביטוח חיים | NOT_APPLICABLE |
| 61360 | ביטוח אובדן כושר עבודה | NOT_APPLICABLE |
| 61370 | הפקדה לפנסיה | NOT_APPLICABLE |
| 61380 | הפקדה לקרן השתלמות | NOT_APPLICABLE |

1. **Codes 61340–61380 — approved.** Allocated sequentially in the SYSTEM
   expense range (60000–69999) starting from the current ceiling (`61330`,
   the last `פחת` child) — the same jump-of-10 result
   `AccountCodeAllocatorService` would produce. No collision with any
   existing or planned code.
2. **`recognitionType` — corrected to a new third value, `NOT_APPLICABLE`.**
   Original proposal was `NOT_RECOGNIZED`, mirroring the `60000 הוצאות לא
   מוכרות` card's convention. Elazar's correction: these five cards aren't
   *disallowed* business expenses (that's what `NOT_RECOGNIZED` means —
   e.g. קנסות, a real business expense the Tax Authority refuses to let you
   deduct) — they're not business expenses at all, they're personal
   tax-credit items routed to the annual report. Tagging them
   `NOT_RECOGNIZED` would make them indistinguishable from real disallowed
   expenses in any future "unrecognized expenses" report.

   **`RecognitionType` enum change**: added `NOT_APPLICABLE = 'NOT_APPLICABLE'`
   (`backend/src/enum.ts`). Applied to:
   - The five new ANNUAL cards above (was `NOT_RECOGNIZED`, corrected).
   - The six existing 90100–90600 TECHNICAL cards, which previously got
     `recognitionType: null` via the `NOT_APPLICABLE_LAW` spread in
     `chart.seed.ts` — same reasoning applies to them (מקדמות מס הכנסה,
     גביית מע"מ, etc. aren't unrecognized expenses either, they're not
     expenses). `chart.seed.ts` now overrides `recognitionType:
     RecognitionType.NOT_APPLICABLE` explicitly on all six, after the
     `NOT_APPLICABLE_LAW` spread.
   - **NOT** applied to true balance-sheet (1000–2999) or income
     (40000/40010) accounts — those keep `recognitionType: null` via
     `NOT_APPLICABLE_LAW`, unchanged. Elazar's instruction scoped the
     correction to "these 5 ANNUAL cards and... the 90000-range TECHNICAL
     cards" specifically; balance-sheet/income accounts were not asked
     about and are left as-is (`null` already meant "not applicable" there
     too, just via a different, pre-existing convention — no behavior
     change, nothing reads `recognitionType` on those account types).
   - **DDL**: `booking_account.recognitionType` is a real MySQL `ENUM`
     column (`ENUM('RECOGNIZED','NOT_RECOGNIZED')` since the 2026-07-10
     chart-renumber migration) — widening it to a third value needs an
     explicit `ALTER TABLE ... MODIFY COLUMN`, now the second statement in
     `2026-07-14_reportscope_card_migration_schema.sql`.
   - **Guardrail documented in the enum's own JSDoc**: any future report
     that sums "unrecognized" totals must filter `recognitionType ===
     NOT_RECOGNIZED` specifically, never a blanket `!== RECOGNIZED` (which
     would silently pull in these NOT_APPLICABLE cards too). No such report
     exists yet in this codebase — confirmed by grep — so nothing needed
     fixing this session, but the comment is there so the next person who
     writes one doesn't reintroduce the bug Elazar is heading off.
   - **Frontend**: `card-management.component` (admin "כרטיסים" screen —
     the one place a human directly sets a card's `recognitionType`) gained
     a third picker option ("לא רלוונטי (לא הוצאה עסקית)") and label.
     `category-management.component` (sub_category screen) was left alone —
     it only ever displays the boolean-flattened `isRecognized` (already
     `false` for both `NOT_RECOGNIZED` and `NOT_APPLICABLE`, a pre-existing
     legacy-shape limitation, not something this correction needs to fix).

**Third thing surfaced, not asked about but worth flagging explicitly:**
giving these five sub_categories a real `accountId` for the first time
changes more than reporting. `ExpensesService.resolveExpenseClassification`
decides `journalable` from `resolved.account != null &&
subCategory.approvalStatus === APPROVED` — nothing there ever looked at
reportScope. Today these five are `MISSING_ACCOUNTING_MAPPING` +
`accountId = NULL`, so any expense classified onto them is silently
non-journalable. After this migration they resolve to a real
`APPROVED` card, so **a client manually classifying an expense onto e.g.
"תרומות מוכרות" (outside the D8 OCR/annual-document תייק flow) will now
post a real (zero-value-excluded-from-P&L) journal entry** where today it
would be stuck unmapped. This is consistent with D1 ("the card carries the
law even when that law routes elsewhere") and with the instruction's own
framing ("this is a repointing, not a behavior change on the reports
side") — P&L totals are provably unaffected (reportScope+sectionId both
exclude these cards), but the ledger/כרטסת view of these five accounts
will show new activity going forward that it never could before. Flagging
for explicit awareness before MODE=apply, not blocking on it — it reads as
the intended consequence of the model change, not a bug.

## Migration plan (not yet run)

1. **Schema DDL** (`2026-07-14_reportscope_card_migration_schema.sql`,
   append to `cutover.sql`, run first):
   ```sql
   ALTER TABLE booking_account ADD COLUMN reportScope ENUM('pnl','annual','technical') NOT NULL DEFAULT 'pnl' AFTER recognitionType;
   ALTER TABLE booking_account MODIFY COLUMN recognitionType ENUM('RECOGNIZED','NOT_RECOGNIZED','NOT_APPLICABLE') NULL DEFAULT NULL;
   ALTER TABLE sub_category DROP COLUMN reportScope;
   ```
2. **Seeder run** (`CatalogSeedService.runSeed()` — same MODE=review/apply
   pattern as `2026-07-12_run-catalog-seeder.ts`): `seedAccounts()`
   upserts-by-code, so it will (a) flip the six 90100–90600 rows' new
   `reportScope` column to `TECHNICAL`, and (b) create the five new 613xx
   ANNUAL rows. `seedSystemCatalog()` is create-if-missing only, so it will
   **not** touch the five existing ANNUAL sub_category rows (they already
   exist from the Phase 2.2 migration) — that repoint is a separate,
   explicit step:
3. **Targeted UPDATE** — point the five existing SYSTEM sub_category rows
   at their new accountId:
   ```sql
   UPDATE sub_category s JOIN booking_account a
     ON a.chartOwnerKey = 'SYSTEM' AND a.code = <code>
     SET s.accountId = a.id
     WHERE s.chartOwnerKey = 'SYSTEM' AND s.name = '<name>';
   ```
   for each of the five (name, code) pairs above. `approvalStatus` is
   already `APPROVED` on these rows (D14 decision 2's original migration
   set it that way even with `accountId = NULL`) — no change needed there.
4. **Orphan check** — before running step 3, query whether any CLIENT- or
   ACCOUNTANT-scoped override of these five names exists in
   `keepintax_prodcopy` (a business that created its own "תרומות מוכרות"
   row independent of the SYSTEM one). None are expected (D14 never
   documented any), but per this project's own "verify zero orphans, don't
   assume" discipline this gets a real query, not an assumption, before
   applying.
5. **Verification**: re-run `compare-baseline-reports.ts` against
   `keepintax_prodcopy` post-migration — expect **zero diffs** (this
   migration touches zero rows in `journal_entry`/`journal_line`/`expense`;
   see the behavior-change note above for why *future* activity, not
   historical, is the only thing that changes).

## Still open before MODE=apply

- ~~Elazar's sign-off on the account codes~~ — approved.
- ~~Elazar's sign-off on recognitionType~~ — corrected to NOT_APPLICABLE
  (this revision), applied to the 5 ANNUAL + 6 TECHNICAL cards.
- Acknowledgement of the journaling-behavior-change note (unchanged by this
  revision — still open).
- Run step 4's orphan query for real against `keepintax_prodcopy` (not yet
  done — this doc was written from the code-side migration plan, not a
  live query).
- Final go-ahead to run the schema DDL + `MODE=apply` against
  `keepintax_prodcopy`.
