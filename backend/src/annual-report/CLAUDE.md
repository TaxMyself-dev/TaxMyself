## Purpose
Manages the annual tax report workflow for a business/tax-year: a dynamic questionnaire that determines which supporting-document categories are required, file uploads against those categories, and the finish/reported lifecycle.

## Key entities/files
- `annual-report.entity.ts` — `AnnualReport` (one row per businessNumber+taxYear, unique-indexed): status (WAITING_FOR_DOCS/READY_TO_PREPARE/REPORTED), free-form `answers` JSON, computed `requiredCategories` (category + minCount), `reportedAt`/`reportedByAccountantFirebaseId`.
- `annual-report-file.entity.ts` — `AnnualReportFile`: uploaded document rows (category, filePath, fileName, uploadedByFirebaseId) linked by `annualReportId`.
- `annual-report.questions.ts` — static question schema (`ANNUAL_REPORT_QUESTIONS`) and `computeRequiredCategories(answers)` which derives required doc categories/minCounts from questionnaire answers.
- `annual-report.service.ts` — `AnnualReportService`: getOrCreate, saveAnswers, addFile/removeFile, finish (validates required docs uploaded), setReported (accountant-only, syncs AccountantTask + locks/unlocks transactions for the year).
- `annual-report.controller.ts` — `/annual-report` REST endpoints, all behind `FirebaseAuthGuard`.

## Main flows
- `GET /annual-report/questions` — returns the question schema (frontend owns Hebrew labels).
- `GET /annual-report?businessNumber&taxYear` — get-or-create the report row for a business/year.
- `PATCH :id/answers` — save questionnaire answers; recomputes `requiredCategories`.
- `POST :id/files` / `DELETE files/:fileId` — manage uploaded supporting documents.
- `POST :id/finish` — client marks docs complete; blocked if required categories are under-uploaded; moves status to READY_TO_PREPARE.
- `PATCH :id/reported` — accountant-only; toggles REPORTED status, syncs the paired `AccountantTask`, and locks/unlocks the year's transactions.

## Related topics
- delegation (accountant access-control on client reports)
- business (report is scoped to a business)
- accountant-tasks (`AccountantTask` rows synced on setReported)
- transactions (locks/unlocks the tax year's transactions when a report is filed/unfiled)
- users (owner/accountant identity)
