## Purpose
Report page that produces the Israeli Form 1342 depreciation report for a business and tax year, with Excel and print-to-PDF export.

## Key entities/files
- `depreciation-report.page.ts` — `DepreciationReportPage`; filter form (business + tax year, last 15 years), fetches and renders the asset depreciation table plus totals row; `exportToExcel()` uses `xlsx`, while `exportToPdf()` downloads the backend-rendered PDF so browser date/title/URL headers cannot appear.
- `depreciation-report.service.ts` — `DepreciationReportService.getDepreciationReport()`, `GET {apiUrl}reports/depreciation-report`; also defines `IForm1342Report`/`IForm1342ReportRow` mirroring the backend DTOs.
- `depreciation-report.module.ts` / `-routing.module.ts` — standard page module wiring, uses shared `FilterTabComponent` and `ButtonComponent`.

## Main flows
- Select business + year, submit to fetch the report; display cleared automatically whenever filters change until resubmitted.
- Export the current report to `.xlsx` (RTL sheet, one row per asset + totals).
- Export to PDF through `GET reports/depreciation-report-pdf`; the server-rendered depreciation attachment uses the `Created by KeepInTax LTD` credit footer and never exposes browser print metadata.

## Related topics
- Backend `reports` module (`GET reports/depreciation-report`).
- Uses `GenericService` (business list, formatting) and `AuthService`.
