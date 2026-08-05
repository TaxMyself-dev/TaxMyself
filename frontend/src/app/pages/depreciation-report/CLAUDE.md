## Purpose
Report page that produces the Israeli Form 1342 depreciation report for a business and tax year, with Excel and print-to-PDF export.

## Key entities/files
- `depreciation-report.page.ts` — `DepreciationReportPage`; filter form (business + tax year, last 15 years), fetches and renders the asset depreciation table plus totals row; `exportToExcel()` (via `xlsx`) and `exportToPdf()` (hidden-iframe `window.print()`, includes the required KeepInTax footer text).
- `depreciation-report.service.ts` — `DepreciationReportService.getDepreciationReport()`, `GET {apiUrl}reports/depreciation-report`; also defines `IForm1342Report`/`IForm1342ReportRow` mirroring the backend DTOs.
- `depreciation-report.module.ts` / `-routing.module.ts` — standard page module wiring, uses shared `FilterTabComponent` and `ButtonComponent`.

## Main flows
- Select business + year, submit to fetch the report; display cleared automatically whenever filters change until resubmitted.
- Export the current report to `.xlsx` (RTL sheet, one row per asset + totals).
- Export to PDF via an in-page print dialog, embedding the mandated KeepInTax compliance footer.

## Related topics
- Backend `reports` module (`GET reports/depreciation-report`).
- Uses `GenericService` (business list, formatting) and `AuthService`.
