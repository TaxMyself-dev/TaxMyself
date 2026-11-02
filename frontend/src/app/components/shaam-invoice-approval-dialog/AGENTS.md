## Purpose

Retired free-form SHAAM allocation dialog. It is no longer imported by any
page/module and its direct-submit service method fails closed.

## Key entities/files

- `shaam-invoice-approval-dialog.component.ts` is legacy source and must not be
  reconnected. Remove it during the pre-push cleanup.

## Main flows

- The active flow persists `PENDING_ALLOCATION` and sends only its identity to
  the backend. Never restore browser-supplied fiscal payload submission.

## Related topics

- `backend/src/shaam/AGENTS.md`
- `frontend/src/app/pages/doc-create/AGENTS.md`
- `docs/research/shaam-integration-audit.md`
