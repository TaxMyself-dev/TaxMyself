## Purpose
Standalone pricing/plans page where a user views available subscription plans and starts checkout for one.

## Key entities/files
- `billing-plans.page.ts` — standalone `BillingPlansPage`; fetches plans, builds a display view-model (`PlanVM`) merging module-based access-control items and marketing "feature" flags, and starts checkout.
- `billing-plans.page.html` / `.scss` — pricing card grid UI.

## Main flows
- `/billing/recovery` renders `BillingRecoveryPage` for owner PAST_DUE/CANCELED state,
  previews every unpaid subscription period and the server debt total, discloses one invoice and card replacement for future
  renewals before submitting the existing checkout endpoint. It does not offer
  plan selection. Canceled debt payment explicitly leaves the subscription canceled. The plans page links to recovery for both debt states. Overrides, missing/unsupported state and preview failures
  cannot submit; double-clicks are suppressed and checkout errors require
  review rather than offering an immediate second submission.
- Submission requires ILS, nonempty period lines and the server recoveryQuote;
  checkout sends that quote with recoveryOnly so stale totals cannot be charged.
- The app's PAST_DUE dialog opens debt settlement with the label הסדרת התשלום.
- Focused verification from frontend: `npm run ng -- test --watch=false
  --browsers=ChromeHeadless --include=src/app/pages/billing/billing-recovery.page.spec.ts
  --ts-config=tsconfig.billing.spec.json`. This config isolates recovery specs
  from legacy unrelated specs; dependency declarations use skipLibCheck.
- On init, `GET {apiUrl}billing/plans` and render plan cards with computed shekel pricing (`effectivePriceMonthlyAgorot`, resolved server-side per the user's billing business type).
- `checkout(planId)` calls `POST {apiUrl}billing/checkout`, then redirects the browser to the returned Cardcom `paymentUrl`.

## Related topics
- Backend `billing` module (`GET billing/plans`, `POST billing/checkout` — Cardcom integration).
- Routed under `/billing/plans` (guarded by `AuthGuard`) in `app-routing.module.ts`; `/billing` redirects to `plans`.
- Uses `GenericService` for toast notifications on error.
