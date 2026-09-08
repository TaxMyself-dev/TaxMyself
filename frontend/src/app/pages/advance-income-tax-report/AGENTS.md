## Purpose
Report page that shows a business's advance income tax ("מקדמות מס") computation for a selected business and period (monthly/bimonthly).

## Key entities/files
- `advance-income-tax-report.page.ts` — `AdvanceIncomeTaxReportPage`; builds the filter form (business + period), formats and orders the returned report fields (different field sets for licensed vs. exempt businesses).
- `advance-income-tax-report.service.ts` — `AdvanceIncomeTaxReportService.getAdvanceIncomeTaxReportData()`, `GET {apiUrl}reports/advance-income-tax-report`.
- `advance-income-tax-report.module.ts` / `-routing.module.ts` — standard Ionic page module/route wiring, uses shared `FilterTabComponent`.

## Main flows
- User selects a business and a monthly/bimonthly period, then clicks "הצג" to fetch and display the report (values are cleared automatically whenever a filter changes, before re-fetching).
- Report field set and labels adapt based on `businessType` (`EXEMPT` vs. licensed) returned from the backend.

## Related topics
- Backend `reports` module (`GET reports/advance-income-tax-report`).
- Uses `GenericService` (business list, period helpers) and `AuthService` — both frontend core/shared services.
