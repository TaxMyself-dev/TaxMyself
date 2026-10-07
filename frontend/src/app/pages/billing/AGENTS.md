## Purpose

Open-banking trial enrollment presents concise card/charge/cancellation terms and a plan card with VAT-inclusive monthly price and the original trial-end charge date. A sole eligible plan is displayed without a radio selector; multiple eligible plans retain selection. This presentation does not alter billing authorization or provider verification.
Standalone pricing/plans page where a user views available subscription plans and starts checkout for one.

## Key entities/files
- `billing-plans.page.ts` — standalone `BillingPlansPage`; fetches plans, builds a display view-model (`PlanVM`) merging module-based access-control items and marketing "feature" flags, and starts checkout.
- `billing-plans.page.html` / `.scss` — pricing card grid UI.

## Main flows
- KT-053: /billing/open-banking is an authenticated enrollment page displaying
  only server-eligible OPEN_BANKING plans, original trial end and the quoted
  first monthly price including VAT. Explicit checkbox approval precedes
  PREPARE; existing saved cards can be reused/replaced. CardCom token-only
  dialog completion, not browser submission, precedes Feezback consent link.
  Hosted fallback returns to enrollment only after backend-confirmed card save.
  PREPARE/READY can be canceled into a non-banking plan before the boundary;
  that preserves trial and withdraws automatic billing. Parallel plan checkout
  is blocked and links back to enrollment management. Provider deletion remains
  deferred; this UI never claims that a Feezback account was deleted.

- New canonical purchases/recovery return lowProfileId; the page stores it in
  tab-local sessionStorage before redirect. The dashboard consumes it to scope
  payment-result polling. Legacy checkout responses retain their old handling.

- Local billing worktree runs with `npm run start:billing` from frontend on
  localhost:4201; environment.ts points to backend localhost:3001. Production
  and cloud-dev environment replacements retain their existing endpoints.
- PAST_DUE owners can open the existing card-change dialog directly from
  recovery, including when debt preview needs review. The page explains that
  replacing a card alone neither pays the debt nor removes the block. The
  dialog is instantiated only when opened. Overrides cannot open it; canceled
  card changes remain unsupported by the existing backend.
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
  from legacy unrelated specs; dependency declarations use skipLibCheck and
  Node types required by existing card-dialog transitive imports.
- On init, `GET {apiUrl}billing/plans` and render plan cards with computed shekel pricing (`effectivePriceMonthlyAgorot`, resolved server-side per the user's billing business type).
- `checkout(planId)` calls `POST {apiUrl}billing/checkout`, then redirects the browser to the returned Cardcom `paymentUrl`.

## Plan changes (KT-051)

KT-052 disables selecting/confirming a new plan while pendingCancellation is
present and directs the owner to withdraw cancellation in My Subscription.

ACTIVE owners select a different plan to obtain a preview, then explicitly
confirm its server quote and timestamp. The preview shows the current prorated
VAT-inclusive charge, preserved billing date and future full renewal estimate.
Downgrades are scheduled for the next renewal with no charge now; zero-cost
upgrades apply locally. Positive upgrades reuse CardCom redirect and scoped
LowProfile return polling. Current plan and billing overrides cannot submit.
Expired quotes and submission failures clear the preview; double submission
is suppressed. Pending downgrades can be canceled by exact eventId here or in
My Subscription. The backend is authoritative for ownership and stale state.
Focused tests use tsconfig.billing-plan-change.spec.json with the plans,
recovery, billing-state and admin-subscriptions spec includes.

## Pending payment status

- Reserved debt previews use the typed BILLING_PAYMENT_PENDING error and show
  support/review guidance instead of the generic debt-loading failure. Payment
  stays disabled while unresolved; the existing card-only route stays reachable.

## Related topics
- Backend `billing` module (`GET billing/plans`, `POST billing/checkout` — Cardcom integration).
- Routed under `/billing/plans` (guarded by `AuthGuard`) in `app-routing.module.ts`; `/billing` redirects to `plans`.
- Uses `GenericService` for toast notifications on error.
