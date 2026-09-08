## Purpose
Standalone pricing/plans page where a user views available subscription plans and starts checkout for one.

## Key entities/files
- `billing-plans.page.ts` — standalone `BillingPlansPage`; fetches plans, builds a display view-model (`PlanVM`) merging module-based access-control items and marketing "feature" flags, and starts checkout.
- `billing-plans.page.html` / `.scss` — pricing card grid UI.

## Main flows
- On init, `GET {apiUrl}billing/plans` and render plan cards with computed shekel pricing (`effectivePriceMonthlyAgorot`, resolved server-side per the user's billing business type).
- `checkout(planId)` calls `POST {apiUrl}billing/checkout`, then redirects the browser to the returned Cardcom `paymentUrl`.

## Related topics
- Backend `billing` module (`GET billing/plans`, `POST billing/checkout` — Cardcom integration).
- Routed under `/billing/plans` (guarded by `AuthGuard`) in `app-routing.module.ts`; `/billing` redirects to `plans`.
- Uses `GenericService` for toast notifications on error.
