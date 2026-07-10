## Purpose
Double-entry bookkeeping core: chart of accounts, journal entries/lines, and the seed logic that maps expense categories/sub-categories onto bookkeeping account codes. Posted-to by other modules (expenses, documents) — this module itself exposes no HTTP endpoints.

## Key entities/files
- `account.entity.ts` — `DefaultBookingAccount`: the chart of accounts (code, name, type asset/liability/equity/income/expense, `pnlCategory`, `displayOrder`).
- `account.seed.ts` — `DEFAULT_ACCOUNTS`: the canonical chart-of-accounts data upserted on boot.
- `account-seed.service.ts` — `AccountSeedService` (`OnModuleInit`): on every boot, (1) upserts `DEFAULT_ACCOUNTS`, (2) ensures required `default_sub_category` rows exist with correct `pnlCategory`, (3) fills `default_sub_category.accountCode`/`default_category.accountCode` via a multi-step precedence cascade (recognized-expense baseline → legacy pnlCategory map → category defaults → keyword rules → equipment → income), (4) fills per-sub-category `subAccountCode` sub-ledger numbering. All steps are idempotent and only ever fill currently-NULL columns — never overwrite an admin edit.
- `jouranl-entry.entity.ts` — `JournalEntry` (header): globally-unique auto-increment PK plus a per-business `entryNumber` for display; date, reference (type+id back to the source expense/document), reporting period label, counter-account/sub-account codes, counterparty name, document total.
- `jouranl-line.entity.ts` — `JournalLine`: debit/credit rows under a `JournalEntry`, with VAT/tax-deductible split (`amountBeforeVat`, `vatAmount`, `taxPercent`, `vatPercent`, `amountForTax`), `isEquipment` flag.
- `dto/journal-entry-input.interface.ts` — `JournalEntryInput`/`JournalLineInput`: the shape callers (e.g. ExpensesService) pass into `BookkeepingService`.
- `bookkeeping.service.ts` — `BookkeepingService`: `createJournalEntry`, `replaceJournalEntryLines`, `updateJournalEntryFull`, `findJournalEntryNumber` — all transactional (join caller's `EntityManager` or open their own), resolve every account code before writing so a bad code aborts cleanly.
- `bookkeeping.controller.ts` — `/bookkeeping`; currently has **no routes defined** (empty controller shell — this topic is consumed entirely as an internal service today, not via its own REST surface).

## Main flows
- Journal posting is invoked programmatically by other modules (not via this module's own HTTP API): create a journal entry + lines for a new expense/document, replace lines when a source row is re-classified, or full header+lines update when a source row is edited.
- Per-business running `entryNumber` is advanced only after a successful post (via `SharedService.getJournalEntryCurrentIndex`/`incrementJournalEntryIndex`), inside the same transaction as the entry write.
- Boot-time chart-of-accounts and category→account-code seeding runs automatically via `AccountSeedService.onModuleInit`.

## Related topics
- expenses (primary caller of `BookkeepingService`; owns `default_category`/`default_sub_category` rows this module seeds `accountCode`/`subAccountCode` onto)
- shared (`SharedService` — journal entry numbering, VAT reporting-period helpers)
- transactions (legacy `Transactions` entity still wired into the module purely to satisfy `SharedService`'s constructor injection — marked for removal)
- documents (`SettingDocuments` entity registered for the module; journal entries reference documents via `referenceType`/`referenceId`)
- reports (P&L/VAT journal reports read `JournalEntry`/`JournalLine` and `pnlCategory`)
