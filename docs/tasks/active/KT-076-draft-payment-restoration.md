# KT-076 - Restore draft payment amounts after SHAAM OAuth

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worker: Codex
- Worktree: primary checkout
- Branch: `main`
- Base commit: `72098ca9`

## Business outcome

Returning from SHAAM authorization restores each saved payment row completely,
including its amount, so the user can continue issuing the same document
without deleting and recreating the payment.

## Acceptance criteria

- [x] A persisted draft payment's `paymentAmount` is restored as the frontend
      `paymentSum` value displayed and submitted by the document form.
- [x] Restored payments retain a valid sequential `paymentLineNumber`.
- [x] The restored payment total is recalculated immediately.
- [x] Existing frontend-shaped `paymentSum` draft data remains supported.
- [x] Focused frontend tests and the Angular production build pass.

## Scope and constraints

- In scope: draft payment normalization in `doc-create`, focused regression
  coverage, and the nearest topic documentation.
- Out of scope: production access/deployment, SHAAM OAuth or API behavior,
  document numbering, database schema/data, accounting and journal behavior.
- Required reading: root and `doc-create` `AGENTS.md`, coordination workflow,
  authority, quality gates and lessons.
- Approval boundaries: no production action and no external SHAAM call.

## Handoff

- Result: complete
- Commit hash(es): this task commit
- Changed files: `doc-create.page.ts`, its focused request spec, the nearest
  topic `AGENTS.md`, and this task record.
- Tests and exact results: focused ChromeHeadless suite passed 26/26; Angular
  production build exited 0.
- Known pre-existing failures: none. The first sandboxed Chrome launch failed
  at the Windows GPU/registry boundary; the identical focused test passed
  outside that boundary. The production build retained existing style/bundle
  budget and CommonJS warnings.
- Schema / production / security / accounting / external impact: no schema,
  production-data, security, accounting, journal or external-API change.
- Risks and manual checks: after deployment, repeat the OAuth return flow with
  a tax-invoice receipt draft and verify the payment amount and total remain
  populated. This change does not diagnose or bypass an upstream SHAAM 401.
- Documentation updated: `frontend/src/app/pages/doc-create/AGENTS.md` and this
  task record.

## Integration

- Reviewed by: Codex
- Integrated commit: this task commit on local `main`
- Combined verification: focused frontend 26/26; Angular production build
  passed.
- `origin/main` verification: pending commit/push
- User-visible run instructions: deploy the updated frontend, then repeat the
  return-from-SHAAM flow; backend deployment/configuration remains separately
  required for the reported upstream 401.
