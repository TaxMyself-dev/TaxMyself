## Purpose
Admin-panel tab that hosts billing administration, split into two sub-tabs: plan management and subscription management.

## Key entities/files
- `admin-billing.component.ts`/`.html` — thin standalone shell: `app-tab-bar` switches a `selectedSubTab` signal between `'plans'` and `'subscriptions'`, conditionally rendering the two child components.
- `plans/billing-plans.component.ts` — CRUD for `AdminPlan` (pricing, included modules: INVOICES/OPEN_BANKING/ACCOUNTANT) via `AdminBillingService`; generic table + dialog-based create/edit forms.
- `subscriptions/billing-subscriptions.component.ts` — subscription list, plan/trial/discount drawer, discount management (`UpdateSubscriptionDiscountPayload`), renewal batch runs (`RenewalBatchResult`) via `AdminBillingService`.
- `subscriptions/billing-subscriptions.presentation.ts` — drawer/table presentation rules: canonical referral-plan labels and the design-system save-button color.

## Main flows
- Switch between "plans" and "subscriptions" sub-tabs.
- Plans: list/create/edit pricing plans and their included modules.
- Subscriptions: list subscriptions, edit plan/trial end/discounts, and run renewal batches. The two accountant-referral plans are labeled from their canonical slugs (`referral-basic` and `referral-open-banking`), so they stay visibly distinct even if stored names match; other plan names are preserved. The drawer save action uses the shared `ButtonColor.BLACK` configuration. After save the list reloads, including a backend-restored `TRIAL` status when an admin extends an expired trial into the future.

## Related topics
- Backend: billing (`AdminBillingService` → admin billing endpoints)
- Frontend pages: admin-panel (embeds `<app-admin-billing>` as a tab)
- Frontend shared: clients-dashboard (sibling admin-panel tab; reads subscription status via the same `AdminBillingService.getSubscriptions()`)
