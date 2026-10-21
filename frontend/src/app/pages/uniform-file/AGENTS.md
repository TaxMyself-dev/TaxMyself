## Purpose
Generates the "מבנה קבצים אחיד" (Israeli Uniform File Format) export required by the tax authority for a selected business and period, downloads it as a zip, and optionally submits its INI/BKM pair through the separate SHAAM Daily Token flow.

## Key entities/files
- `uniform-file.page.ts` — `UniformFilePage`. Filter form (business + date-range only, via `app-filter-tab`), calls `FilesService.createUniformFile`, renders document/list summary tables, base64→zip download, checks the Uniform File connection and starts submission/status polling through `ShaamService`.
- `uniform-file.page.html` / `.scss` — filter tab, summary tables (`uniformFileDocumentSummaryTitles`, `uniformFileListSummaryTitles`), report-details header.
- `uniform-file.module.ts` / `-routing.module.ts` — Angular module wiring; imports `GenericTableComponent`, `FilterTabComponent`.
- No dedicated `.service.ts` in this directory — the actual file-generation HTTP call lives in the shared `FilesService` (`createUniformFile`), not a page-local service.

## Main flows
- Select business + date range (date-range period mode only) → `onSubmit` resolves dates via `DateService.getStartAndEndDates`, normalizes them to ISO `YYYY-MM-DD` for the API and stable summary display, then calls `createUniformFile(startDate, endDate, businessNumber)`.
- `createUniformFile` calls `FilesService.createUniformFile`, formats the returned `document_summary`/`list_summary` rows (comma-formatted sums), and triggers `downloadBase64Zip` which decodes the base64 zip payload and auto-downloads `openformat.zip`.
- The ZIP remains the fallback and is generated before SHAAM submission is
  offered. Submission is enabled only after a successful generation and an
  active `UNIFORM_FILE` connection. OAuth uses the `uniform-file` callback
  origin so the user can return directly to this page.
- The page displays only safe persisted pair/file states. `Uploaded` is
  rendered as waiting for processing, never as approval; both files must be
  `Approved` for the pair to appear approved. Polling is an explicit user
  action and stops being offered after approval or rejection.
- Errors during generation surface as a toast via `MessageService`.

## Related topics
- Backend: reports or documents (uniform-file generation endpoint, called through `FilesService`), business.
- Frontend shared: `FilesService` owns generation/download and `ShaamService`
  owns OAuth, submission and polling; filter-tab, generic-table components.
