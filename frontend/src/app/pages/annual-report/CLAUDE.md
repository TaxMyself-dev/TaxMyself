## Purpose
Wizard-style page for preparing a business's annual tax report: answer a fixed questionnaire, upload required supporting documents by category, then submit/finish the report.

## Key entities/files
- `annual-report.page.ts` — `AnnualReportPage`; three-step wizard (`questions` → `docs` → `review`) driven by signals; computes visible questions (via `dependsOn`), required document categories, missing categories, and whether the report can be finished.
- `annual-report.module.ts` / `-routing.module.ts` — standard page module wiring.
- Uses `AnnualReportService`, `ClientPanelService`, `FilesService` (injected from `src/app/services`).

## Main flows
- Load or create the current year's report (`AnnualReportService.getOrCreate`) for the active business (self or, when an accountant is viewing a client, the client's business).
- Answer questionnaire (`ANNUAL_REPORT_QUESTIONS`), with debounced auto-save (800ms) of partial answers.
- Upload/remove/preview/download supporting files per document category (via `FilesService`, backed by Firebase Storage).
- Finish the report (`finish()`) once all required answers/docs are present; mark/unmark as "reported" (`setReported`).

## Related topics
- Backend `annual-report` module (`AnnualReportService` API: getOrCreate, saveAnswers, uploadFile, removeFile, finish, setReported).
- Backend `documents`/`google-drive` (file storage) via `FilesService`.
- Frontend `clients-panel` — accountants navigate here in "view-as-client" mode via `ClientPanelService.setSelectedClient` / `AuthService.setActiveBusinessNumber`.
