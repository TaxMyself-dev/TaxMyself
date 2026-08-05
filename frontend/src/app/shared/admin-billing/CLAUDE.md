## Purpose
Admin-panel tab that hosts billing administration, split into two sub-tabs: plan management and subscription management.

## Key entities/files
- `admin-billing.component.ts`/`.html` — thin standalone shell: `app-tab-bar` switches a `selectedSubTab` signal between `'plans'` and `'subscriptions'`, conditionally rendering the two child components.
- `plans/billing-plans.component.ts` — CRUD for `AdminPlan` (pricing, included modules: INVOICES/OPEN_BANKING/ACCOUNTANT) via `AdminBillingService`; generic table + dialog-based create/edit forms.
- `subscriptions/billing-subscriptions.component.ts` — subscription list, discount management (`UpdateSubscriptionDiscountPayload`), renewal batch runs (`RenewalBatchResult`) via `AdminBillingService`.

## Main flows
- Switch between "plans" and "subscriptions" sub-tabs.
- Plans: list/create/edit pricing plans and their included modules.
- Subscriptions: list subscriptions, apply/edit discounts (percent, fixed amount, or none, with optional date range), run renewal batches.

## Related topics
- Backend: billing (`AdminBillingService` → admin billing endpoints)
- Frontend pages: admin-panel (embeds `<app-admin-billing>` as a tab)
- Frontend shared: clients-dashboard (sibling admin-panel tab; reads subscription status via the same `AdminBillingService.getSubscriptions()`)
