## Purpose
Standalone page showing cash-flow analytics (income vs. expenses over time, expense breakdown by category) for a selected account/business, with period and line-level filters.

## Key entities/files
- `flow-analysis.component.ts` — standalone component: period selector (3/6 months, year, custom range with validation), account selector, filter type (all/category/subCategory/merchant/paymentMethod), line chart (monthly income/expense) and donut chart (expenses by category) built from signals/computed state.
- `flow-analysis.service.ts` — HTTP calls to backend `transactions` module: `getFlowAnalysis` (monthly flow + category breakdown) and `getMerchants`.
- `flow-analysis-filter.interfaces.ts` — filter-related interface(s).
- No module file — registered directly via `loadComponent` in `app-routing.module.ts` at `/flow-analysis`.

## Main flows
- Pick an account and a date period (preset or custom range), optionally narrow by category/sub-category/merchant/payment method.
- Submit to fetch flow-analysis data and render a line chart (expenses/incomes toggle) and a donut chart of expenses by category.
- Lazy-load filter option lists (categories, sub-categories, merchants, payment methods) only when their filter type is selected.

## Related topics
Backend: transactions
Frontend pages: transactions (via `TransactionsService` for accounts/categories/sources)
Frontend shared: none
