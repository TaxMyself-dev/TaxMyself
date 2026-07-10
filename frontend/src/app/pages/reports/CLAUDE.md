## Purpose
Landing/hub page listing the available report types (VAT, P&L, advance income tax, uniform file, depreciation, ledger) as navigable cards; gates navigation through access control for feature-flagged reports.

## Key entities/files
- `reports.page.ts` — `ReportsPage`. Static `itemsNavigate` array of `ReportItem` (name, link, image, optional `AppRoute` for access-gated items). `onReportCardClick` navigates directly for ungated items, or checks `AccessHandlerService.handleRouteAccess(appRoute)` first for gated ones.
- `reports.page.html` — renders `app-card-navigate` per item inside a grid.
- `reports.module.ts` / `reports-routing.module.ts` — Angular module wiring; imports `CardNavigateComponent`.

## Main flows
- Render report-type cards → on click, either navigate straight to the route (annual report currently commented out / hidden) or run an access check (`AccessHandlerService`) before navigating for VAT / P&L / advance-tax / uniform-file routes.

## Related topics
- Frontend pages: vat-report-journal, pnl-report-journal, advance-income-tax-report, uniform-file, depreciation-report, ledger-report (all reached via card navigation; not imported, only routed to).
- Frontend shared: card-navigate component; `AccessHandlerService` / `AppRoute` from shared access-control.
- Note: this is a thin navigation hub, not a report itself — little logic beyond routing + access gating.
