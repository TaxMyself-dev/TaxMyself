## Purpose
Fire-and-forget notification side-channel for client/accountant collaboration events. V1 is log-only; a stable seam for plugging in real email/WhatsApp/in-app channels later without touching caller code.

## Key entities/files
- `notification.service.ts` — `NotificationService`: `notifyClientWorkflowCreated`, `notifyAccountantWorkflowReady`, `notifyClientWorkflowReported`. Every method is `async`, never throws, and today just `Logger.log`s a formatted line.
- `notifications.module.ts` — provides and exports `NotificationService`.

## Main flows
- Called (best-effort, `.catch(() => {})`) by report-workflow whenever a `ReportWorkflow` changes status: created, flipped to `READY_TO_PREPARE`, or marked `REPORTED`.
- Also referenced by accountant-tasks for equivalent task-lifecycle notifications.

## Related topics
Depended on by: report-workflow, accountant-tasks. Has no dependencies of its own (only takes a `ReportWorkflow` shape as a parameter type).
