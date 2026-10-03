## Purpose

Displays Feezback transaction retrieval details/status within the open-banking
management experience.

## Key entities/files

- `feezback-transactions-dialog.component.ts` submits an admin-selected date
  range, keeps the dialog open after completion, and presents copyable request,
  response, redacted cURL, timestamp, persistence-count, transaction, suspected
  duplicate, and error diagnostics. It can prepare a human-readable Feezback
  support message and copy/download the complete redacted diagnostic JSON; it
  never sends a support request externally.

## Main flows

- The admin-only diagnostic shows raw Feezback transaction payloads and upstream
  errors intentionally, but never authentication headers/tokens or server file
  paths. Sent/received timestamps are rendered in the Israel time zone.
- Partial success is shown consistently as a warning in both the dialog and
  toast: saved transactions remain a success, while failed sources/steps are
  called out separately with their detailed errors.
- The support package includes the diagnostic ID, exact `sub` and full provider
  user identifier, per-source V2/resource/consent identifiers, HTTP timing and
  outcome, raw/extracted/normalized transactions, and suspected duplicate
  groups. Export performs an additional recursive secret redaction in the
  browser even though server-side HTTP traces already redact authorization.
- Diagnostic presentation and the generated Feezback support message use
  English/LTR labels throughout. Visible timestamps use ISO 8601 UTC; the
  complete redacted JSON remains available to inspect, copy, and download.
- The dialog offers an explicit diagnostic-only action. It fetches and renders
  the same provider evidence but does not persist normalized transactions or
  update source sync status; the existing pull action retains persistence.
- Provider contract, consent and production callback changes require explicit
  approval.

## Related topics

- `backend/src/feezback/AGENTS.md`
- `frontend/src/app/shared/trans-management/AGENTS.md`
- `frontend/src/app/pages/transactions/AGENTS.md`
