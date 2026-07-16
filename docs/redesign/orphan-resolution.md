# Phase 3.2 — expense.subCategoryId orphan resolution

Generated 2026-07-14T22:21:02.594Z by `backend/scripts/migrations/2026-07-13_phase3_backfill.ts` (MODE=apply), against `keepintax_prodcopy`.

**Zero orphans.** All 85 expense rows (22 distinct (category, subCategory, businessNumber) pairs) resolved to a real sub_category row via the merged catalog (CLIENT > SYSTEM by name, D4). Matches D14's "production has zero orphans" expectation exactly.

## 3.3 journal lineage summary

- 85 / 85 expenses have a resolvable journal entry (by journalEntryNumber, falling back to referenceType=EXPENSE+referenceId — same lookup order as `ExpensesService.syncExpenseJournalEntry`).
- 0 expense(s) have no journal entry at all -> approvalStatus backfills to PENDING (or MISSING_ACCOUNTING_MAPPING if their resolved sub_category is).
- 0 found journal entries have no line with subCategoryName set -> accountCodeSnapshot etc. stay NULL for those rows (logged, not a hard stop — snapshot absence on a non-standard entry is surfaced by 3.6's verification, not guessed here).
