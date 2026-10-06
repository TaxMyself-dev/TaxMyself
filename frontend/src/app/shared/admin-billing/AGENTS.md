## Purpose
Admin-panel tab that hosts billing administration, split into two sub-tabs: plan management and subscription management.

## Key entities/files
- `admin-billing.component.ts`/`.html` — thin standalone shell: `app-tab-bar` switches a `selectedSubTab` signal between `'subscriptions'`, `'plans'`, and pending receipts. Subscriptions is the first RTL tab and the default view.
- `plans/billing-plans.component.ts` — CRUD for `AdminPlan` (pricing, included modules: INVOICES/OPEN_BANKING/ACCOUNTANT) via `AdminBillingService`; generic table + dialog-based create/edit forms.
- `subscriptions/billing-subscriptions.component.ts` — subscription list, plan/trial/discount drawer, complimentary-access grant/revoke control, discount management (`UpdateSubscriptionDiscountPayload`), renewal batch runs (`RenewalBatchResult`) via `AdminBillingService`.
- `subscriptions/billing-subscriptions.presentation.ts` — drawer/table presentation rules: canonical referral-plan labels, the design-system save-button color, and the Hebrew labels/messages for billing exceptions (status, charge mode, failure category, required action, table tooltip).

## Main flows
- Switch between "plans" and "subscriptions" sub-tabs.
- Plans: list/create/edit pricing plans and their included modules.
- Complimentary access grant/revoke requires confirmation, is saved separately
  from ordinary plan edits, and hides manual-charge actions.
- Subscriptions: list subscriptions, including each user's current open-banking connection flag and latest application login timestamp; edit plan/trial end/discounts; and run renewal batches. The two accountant-referral plans are labeled from their canonical slugs (`referral-basic` and `referral-open-banking`), so they stay visibly distinct even if stored names match; other plan names are preserved. The drawer save action uses the shared `ButtonColor.BLACK` configuration. After save the list reloads, including a backend-restored `TRIAL` status when an admin extends an expired trial into the future.
- Billing exceptions (KT-038 Task 5B, read-only): a subscription with an unresolved `UNKNOWN`/`MANUAL_REVIEW` attempt gets a small warning icon (tooltip: count + most severe status) inside the existing status cell; other rows are unchanged. Opening the existing drawer lazily calls `AdminBillingService.getUnresolvedBillingAttempts(id)` and renders a "חריגות חיוב" section (loading/empty/error states, newest first) with Hebrew status, charge mode, amount, timestamps, reconciliation counts, failure category, CardCom ids, token-recovered flag and whether the customer or an internal reviewer must act. The section has no actions and the API never carries tokens or raw provider data. Karma compiles every spec in the project, so run this area in isolation with a temporary `tsconfig.spec` whose `include` lists only `subscriptions/*.spec.ts` (`ng test --ts-config=… --include=…`).

## Payment exception resolution (KT-045, supersedes the read-only section above)

The same subscription drawer now shows all sanitized attempt states and history,
including CREATED, awaiting customer, processing, captured, declined, canceled,
expired and completed. Only unresolved states contribute to the table warning.
Each unresolved attempt provides required evidence text (10–500 characters)
and three server-guarded actions: read-only CardCom check, completion of an
already verified capture, or release after documented proof of no charge.
Release has an explicit confirmation that the old checkout is no longer payable.
An optional recovered LowProfile ID is available when the local identity is
missing; an existing identity is immutable. Captured attempts show completion
only. Terminal history shows final status and payment identifiers without
unresolved failure reasons, reconciliation scheduling, token-recovery flags or
action guidance. Last manual action and evidence remain in collapsed
"היסטוריית טיפול" details; all decisions carry a server-side actor
audit. Requests include the attempt version, suppress concurrent clicks and
reload details/list after success; errors also refresh details to expose races.
Isolated verification uses frontend/tsconfig.billing-resolution.spec.json.

## Related topics
- Backend: billing (`AdminBillingService` → admin billing endpoints)
- Frontend pages: admin-panel (embeds `<app-admin-billing>` as a tab)
- Frontend shared: clients-dashboard (sibling admin-panel tab; reads subscription status via the same `AdminBillingService.getSubscriptions()`)
