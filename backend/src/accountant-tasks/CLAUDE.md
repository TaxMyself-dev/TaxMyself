## Purpose
Drives the accountant's "משימות" (tasks) todo list — auto-generates recurring VAT/advance-tax/annual-report tasks from each client business's reporting requirements, plus lets accountants add/complete/dismiss manual tasks. Also owns the sibling `ReportWorkflow` row generation that backs client↔accountant report collaboration.

## Key entities/files
- `accountant-task.entity.ts` — `AccountantTask` (accountant's todo row: type VAT_REPORT/ADVANCE_TAX/ANNUAL_REPORT/CUSTOM, source AUTO/MANUAL, period, dueDate, visibleFrom, isComplete/dismissedAt). Unique index on (businessNumber, type, periodStart, periodEnd) makes AUTO generation idempotent.
- `accountant-tasks.service.ts` — `AccountantTasksService`: list/create/update/remove for an accountant, enriches rows with client/business name and linked `AnnualReport`/`ReportWorkflow` status.
- `tasks-generator.service.ts` — `TasksGeneratorService`: enumerates periodic (VAT/advance-tax) and annual periods per business and idempotently inserts `AccountantTask` + `ReportWorkflow` rows. Run lazily on tab entry (`generateForUser`, `generateForAccountant`), not by cron anymore.
- `accountant-tasks.controller.ts` — `/accountant-tasks` REST endpoints, all accountant-only (checked via `UsersService.isAccountant`).

## Main flows
- `GET /accountant-tasks` — lists an accountant's open/done tasks, refreshing (regenerating) state on entry.
- `POST /accountant-tasks` / `PATCH :id` / `DELETE :id` — manual task CRUD; delete on an AUTO task soft-dismisses instead of removing.
- `POST /accountant-tasks/generate` — manual trigger of the full generator (idempotent, mirrors former cron).
- `POST /accountant-tasks/backfill-workflows` — one-shot migration to backfill missing `ReportWorkflow` rows for existing periodic tasks.
- Generation requires an active `Delegation` between accountant and client business owner; workflow rows are also created for undelegated businesses (self-served).

## Related topics
- delegation (active delegation gates task creation/access)
- business (source of reporting-type config used to enumerate periods)
- annual-report (linked `AnnualReport` status shown on ANNUAL_REPORT task rows)
- report-workflow (`ReportWorkflow` rows generated alongside tasks; source of truth for collaboration state)
- users (accountant-role check, client name lookup)
- notifications (notifies client when a new workflow is created)
- shared (`SharedService` for VAT/reporting period math)
