## Purpose
Seeds, resets, and self-service-resets realistic demo/sandbox user accounts (Firebase + full DB graph across most modules) from static, version-controlled "profile" templates, for admin demos and in-app "אפס נתוני בדיקה" testing.

## Key entities/files
- `demo-data.service.ts` — `DemoDataService`: `listProfiles`, `seedProfile` (creates Firebase users + User/Business/Bill/Source/FullTransactionCache/UserSyncState rows in a transaction, then best-effort Documents/Expenses via `DocumentsService`/`ExpensesService`, then optional Google Drive folder provisioning + sample PDF upload), `resetProfile` (full wipe of a profile's users, DB rows, and Firebase accounts), `testReset` (self-service: wipes Drive files + derived DB rows for the calling demo user only, preserving identity/session, then re-seeds transaction cache and re-uploads sample files).
- `demo-data.controller.ts` — `DemoDataController` at route `demo-data`, admin-gated except `test-reset`.
- `demo-profile.types.ts` — `DemoProfile`/`DemoClient`/`DemoUser`/`DemoBusiness`/`DemoBill`/`DemoTransactionTemplate`/`DemoDocumentTemplate`/`DemoExpenseTemplate`/`DemoStandaloneSource` interfaces defining the static profile shape.
- `profiles/*.profile.ts` — concrete profile definitions (e.g. `couple-two-businesses`, `accountant-with-clients`, `single-licensed-no-banking`, `couple-open-banking-no-bills`, `single-ob-ocr-test`, `ledger-test`).
- `profiles/index.ts` — `DEMO_PROFILES` registry array, plus `isDemoEmail()` and `findDemoProfileByEmail()` helpers used to gate the self-service reset endpoint.

## Main flows
- `GET /demo-data/profiles` (admin) — list all profiles with existence status and delegated-client info.
- `POST /demo-data/profiles/:id/seed` (admin) — create Firebase users, DB rows (users, businesses, bills/sources, transaction cache, sync state), delegations for accountant profiles, real documents/expenses (posting journal entries), and optionally Drive folders + sample PDFs.
- `POST /demo-data/profiles/:id/reset` (admin) — delete a profile's Firebase users and all associated DB rows across most modules.
- `POST /demo-data/test-reset` (authenticated demo user only) — wipes Drive inbox/processed files and derived DB rows for the caller, then re-seeds transaction cache + re-uploads sample PDFs, keeping the user/session alive.

## Related topics
- users (`UsersModule`, `UsersService` — trial subscription creation, admin/demo checks, `User`/`Child` entities)
- business (`Business` entity)
- transactions (`Bill`, `Source`, `FullTransactionCache`, `SlimTransaction`, `ClassifiedTransactions`, `UserSyncState`, `UserSourceSyncState`, `UserTransactionCacheState`, legacy `Transactions` entities)
- expenses (`ExpensesModule`/`ExpensesService.addExpense`, `Expense`, `Income`, `Supplier` entities)
- bookkeeping catalog (`Category`/`SubCategory`/`BookingAccount`/`AccountingSection` — reset wipes the demo user's CLIENT-scoped catalog rows since Phase 4.6; the old `UserCategory`/`UserSubCategory` wipes are gone, those tables are frozen)
- documents (`DocumentsModule`/`DocumentsService.createDoc`, `Documents`, `DocLines`, `DocPayments`, `SettingDocuments`, `ExtractedDocument` entities)
- bookkeeping (`BookingAccount` — renamed from `DefaultBookingAccount`, Phase 1.2 of the categories redesign — chart-of-accounts check, `JournalEntry`/`JournalLine` purge)
- delegation (`Delegation` entity — created for accountant/client demo relationships, purged on reset)
- clients (`Clients` entity, purged on reset)
- google-drive (`GoogleDriveModule`/`GoogleDriveService` — folder provisioning, sample file upload/delete)
- shared (`FxRateService`/`FxRate` — consistent FX rates between demo OB transactions and OCR'd documents)
- accountant-tasks (`AccountantTask` entity, purged on reset)
- report-workflow (`ReportWorkflow` entity, purged on reset)
- annual-report (`AnnualReport`/`AnnualReportFile`, purged on reset)
