## Purpose
Tracks the client-facing "report obligation" lifecycle (VAT report / advance income tax) per business and period — from waiting on the client, to ready-to-prepare, to reported — and enforces the transaction-locking and PDF-snapshotting side effects of submission.

## Key entities/files
- `report-workflow.entity.ts` — `ReportWorkflow`: `type` (`VAT_REPORT`/`ADVANCE_TAX`), `status` (`WAITING_FOR_CLIENT`/`READY_TO_PREPARE`/`REPORTED`), period bounds, `clientConfirmedAt/By`, `reportedAt/By/Source` (`MANUAL_ACCOUNTANT`/`SHAAM_WEBHOOK`), `dismissedAt` (soft-delete), `reportFilePath` (Firebase Storage snapshot path). Unique per (businessNumber, type, periodStart, periodEnd).
- `report-workflow.service.ts` — `ReportWorkflowService`: client listing/confirm/dismiss, `setReported` (the core state-machine transition), transaction locking/unlocking, VAT PDF snapshotting, accountant-task syncing.
- `report-workflow.controller.ts` — REST endpoints under `/report-workflows`.
- `dtos/list-workflows.dto.ts`, `dtos/set-reported.dto.ts`.

## Main flows
- `GET /report-workflows/me` — client lists their own workflows; triggers `TasksGeneratorService.generateForUser` first so the list reflects freshly generated periods.
- `POST /:id/confirm` — client confirms all docs uploaded → `WAITING_FOR_CLIENT` → `READY_TO_PREPARE`.
- `PATCH /:id/reported` — accountant (or a self-served client with no active delegation) marks/unmarks `REPORTED`; on mark: locks matching `SlimTransaction`/`FullTransactionCache` rows to the period (`vatReportingDate` + `isLocked=true`), syncs matching `AccountantTask` rows, sends a notification, and (VAT only) snapshots the rendered VAT report PDF to Firebase Storage. On unmark: reverses the lock and clears the stale snapshot.
- `DELETE /:id` — client soft-dismisses (only when no active accountant delegation exists).
- `GET /:id/report-file` — streams the stored as-filed PDF.

## Related topics
Depends on: notifications (`NotificationService`), reports (`ReportsService.generateVatReportPdfBuffer`), shared (`SharedService.getVATReportingDate`), transactions (`SlimTransaction`, `FullTransactionCache` entities), accountant-tasks (`AccountantTask`, `TasksGeneratorService`), delegation (`Delegation`), business (`Business`), users (`User` entity registered in module).
