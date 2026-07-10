## Purpose
Generates the "מבנה קבצים אחיד" (Israeli Uniform File Format) export required by the tax authority for a selected business and period, and downloads it as a zip.

## Key entities/files
- `uniform-file.page.ts` — `UniformFilePage`. Filter form (business + date-range only, via `app-filter-tab`), calls `FilesService.createUniformFile`, renders document/list summary tables, base64→zip download.
- `uniform-file.page.html` / `.scss` — filter tab, summary tables (`uniformFileDocumentSummaryTitles`, `uniformFileListSummaryTitles`), report-details header.
- `uniform-file.module.ts` / `-routing.module.ts` — Angular module wiring; imports `GenericTableComponent`, `FilterTabComponent`.
- No dedicated `.service.ts` in this directory — the actual file-generation HTTP call lives in the shared `FilesService` (`createUniformFile`), not a page-local service.

## Main flows
- Select business + date range (date-range period mode only) → `onSubmit` resolves dates via `DateService.getStartAndEndDates`, then `createUniformFile(startDate, endDate, businessNumber)`.
- `createUniformFile` calls `FilesService.createUniformFile`, formats the returned `document_summary`/`list_summary` rows (comma-formatted sums), and triggers `downloadBase64Zip` which decodes the base64 zip payload and auto-downloads `openformat.zip`.
- Errors during generation surface as a toast via `MessageService`.

## Related topics
- Backend: reports or documents (uniform-file generation endpoint, called through `FilesService`), business.
- Frontend shared: `FilesService` (shared service, not local) is the actual integration point; filter-tab, generic-table components.
