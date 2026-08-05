## Purpose
Main dashboard/home page shown after login: account sync status, transactions-to-classify, quick-access cards (create document, transactions, add expense), Open Banking connection, Feezback onboarding, and billing/payment-result handling.

## Key entities/files
- `my-account.page.ts` — standalone component; the largest/most central page component in the app. Aggregates: bank/card sync status polling (`SyncStatusService`), transactions needing classification (`ExpenseDataService`/`TransactionsService`), Feezback consent/pull dialog flow (`FeezbackService`), payment-result banner + polling after checkout redirect (`BillingStateService`), demo-data reset (`AdminPanelService`, prod-only via `environment.production`), feature-gated navigation to doc-create/transactions (`AccessService`/`AccessHandlerService`/`AppFeature`), modals for add-bill/add-category/classify-transaction/account-association/manual-expense.
- No separate service file — page composes many app-wide services directly; no dedicated `.module.ts` (standalone component, `loadComponent` route).

## Main flows
- On init: load user data, start sync-status polling for connected bank/card sources, fetch transactions to classify, resume Feezback dialog state or payment-result banner from return-URL query params.
- Open Banking: connect a new source (with consent confirmation), retry a failed source, associate an unmatched account.
- Classify or quick-classify pending transactions; Home "הוספת הוצאה" is an `app-menu-button` with Manual Expense (`MannualExpenseComponent`) and Quick Upload to Drive (`QuickUploadDriveDialogComponent` → `DriveDocsService.uploadFilesToInbox`). Also add bill/category via modals.
- Feezback onboarding: show consent dialog, poll for webhook readiness, trigger transaction pull, handle renew-consent/try-again states.
- Billing: poll for payment result after redirect back from checkout, resend receipt email, retry invoice.
- Demo users: reset demo/test data via `AdminPanelService` (button gated by `environment.production`).
- Feature-gated navigation cards to `/doc-create` and `/transactions`, gated through `AccessService`/`AccessHandlerService`.

## Related topics
Backend: transactions, expenses, feezback, billing, demo-data
Frontend pages: doc-create, transactions
Frontend shared: none confirmed (add-bill/add-category/manual-expense/classify-tran modals used here live under `src/app/components/`, not `src/app/shared/`)
