## Purpose
Seeds, resets, and self-service-resets realistic demo/sandbox user accounts (Firebase + full DB graph across most modules) from static, version-controlled "profile" templates, for admin demos and in-app "אפס נתוני בדיקה" testing.

## Key entities/files
- `demo-data.service.ts` — `DemoDataService`: `listProfiles`, `seedProfile` (creates Firebase users + User/Business/Bill/Source/FullTransactionCache/UserSyncState rows in a transaction, then best-effort Documents/Expenses via `DocumentsService`/`ExpensesService`, then optional Google Drive folder provisioning + sample PDF upload), `resetProfile` (full wipe of a profile's users, DB rows, and Firebase accounts), `testReset` (self-service: wipes Drive files + derived DB rows for the calling demo user only, preserving identity/session, then re-seeds transaction cache and re-uploads sample files).
- `demo-data.controller.ts` — `DemoDataController` at route `demo-data`, admin-gated except `test-reset`.
- `demo-profile.types.ts` — `DemoProfile`/`DemoClient`/`DemoUser`/`DemoBusiness`/`DemoBill`/`DemoTransactionTemplate`/`DemoDocumentTemplate`/`DemoExpenseTemplate`/`DemoSource`/`DemoStandaloneSource`/`DemoSourceSyncState` interfaces defining the static profile shape. `DemoSource.isDirect` (optional) → `Source.isDirect`; `DemoProfile.sourceSyncStates` (optional) → `user_source_sync_state` rows. Both are opt-in — profiles that omit them behave exactly as before.
- `profiles/*.profile.ts` — concrete profile definitions (e.g. `couple-two-businesses`, `accountant-with-clients`, `single-licensed-no-banking`, `couple-open-banking-no-bills`, `single-ob-ocr-test`, `ledger-test`, `direct-card-demo`).
- `profiles/direct-card-demo.profile.ts` — permanent Direct/Debit-card demo: bank source + a `isDirect: true` card source, every transaction on the BANK feed (the card has zero of its own), and per-source sync state `success` / `skipped_direct`. Lets the Direct-card UI be verified without calling Feezback. Guarded by `direct-card-demo.profile.spec.ts`. Also declares `legacyDuplicateScenario`, which opts it into the two admin-only before/after actions below.
- `DemoLegacyDuplicateScenario` (in `demo-profile.types.ts`) — opt-in per profile. `applyLegacyDuplicateState()` puts the user in the pre-fix state (card `isDirect = NULL` + status `success`, cache rebuilt with bank rows **plus** a cloned card-feed twin per listed merchant → visible duplicates); `applyDirectCardFix()` puts it in the post-fix state (card `isDirect = true` + `skipped_direct`/count 0, cache rebuilt from the bank feed only → duplicates gone). Both rebuild the cache wholesale (delete `SlimTransaction` + `FullTransactionCache`, re-insert), which is what makes them idempotent and repeatable in either order. The rebuild is deliberate: the production fix only blocks FUTURE card imports and never deletes already-cached rows, so a real user only sheds duplicates on the next re-sync. Twins get a stable `<bankExternalId>-dup` id so re-runs rewrite rather than accumulate. Logic covered by `demo-data.service.direct-card-scenario.spec.ts`.
- `profiles/index.ts` — `DEMO_PROFILES` registry array, plus `isDemoEmail()` and `findDemoProfileByEmail()` helpers. `isDemoEmail()` is the project's single demo-user detection: it gates the self-service reset endpoint, drives `userData.isDemo`, and excludes demo users from the nightly cache cleanup (`TransactionProcessingService.runDailyCacheCleanup`) so seeded demo data is never wiped.

## Main flows
- `GET /demo-data/profiles` (admin) — list all profiles with existence status and delegated-client info.
- `POST /demo-data/profiles/:id/seed` (admin) — create Firebase users, DB rows (users, businesses, bills/sources, transaction cache, sync state), delegations for accountant profiles, real documents/expenses (posting journal entries), and optionally Drive folders + sample PDFs.
- `POST /demo-data/profiles/:id/reset` (admin) — delete a profile's Firebase users and all associated DB rows across most modules.
- `POST /demo-data/profiles/:id/legacy-duplicate-state` / `POST /demo-data/profiles/:id/apply-direct-card-fix` (admin) — flip a profile between the pre- and post-Direct-card-fix states; both seed the demo user first if missing, and 404 for any profile without a `legacyDuplicateScenario`. `listProfiles` reports eligibility as `supportsDirectCardScenario` so the admin UI renders the buttons only where they apply.
- `POST /demo-data/test-reset` (authenticated demo user only) — wipes Drive inbox/processed files and derived DB rows for the caller, then re-seeds transaction cache + re-uploads sample PDFs, keeping the user/session alive. Also re-asserts the profile's `Source.isDirect` flags, `user_source_sync_state` rows, and the user-level `user_sync_state` row (`completed`, never touching a `running` row) via the shared `applyProfileSourceState` helper, so a reset lands on the same state as a fresh seed.

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
