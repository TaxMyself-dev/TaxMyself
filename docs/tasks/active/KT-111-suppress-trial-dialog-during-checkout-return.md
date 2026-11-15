# KT-111 - Suppress trial dialog during checkout return

- Status: `PUSHED`
- Task manager: Codex primary integration manager
- Worker: Codex sequential worker
- Worktree: `C:/Users/harel/.codex/worktrees/kt111/taxmyself-dev`
- Branch: `codex/kt-111-checkout-return-dialog`
- Base commit: `18dcc3a350f48e47b0a6dbdd3ff7425a063e7daf`

## Business outcome

A customer returning from CardCom sees one coherent payment-processing banner,
without the expired-trial plan-selection dialog covering it or inviting another
payment attempt.

## Acceptance criteria

- [x] The billing state exposes a reactive, exact hosted-checkout return context.
- [x] The global blocking dialog is suppressed while that checkout return
  context is active.
- [x] Backend access enforcement and duplicate-charge protection are unchanged.
- [x] Ordinary TRIAL_EXPIRED sessions without a checkout return still show the
  plan-selection dialog.
- [x] Focused frontend tests and Angular production build pass.

## Scope and constraints

- In scope: app-shell billing dialog presentation, billing-state return context,
  focused tests and my-account topic documentation.
- Out of scope: backend, schema, production data, CardCom API and payment-state
  transitions.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`,
  `frontend/src/app/pages/my-account/AGENTS.md`.
- Approval boundaries: UI suppression only; no authorization or access-policy
  relaxation.

## Handoff

- Result: complete
- Commit hash(es): `3b72f38baa1d759a6b6687af9b5c71ed5ebe462a`
- Changed files: app shell, billing-state service and spec, my-account topic
  documentation, this task file.
- Tests and exact results: focused ChromeHeadless 5/5 passed with
  `tsconfig.billing-purchase.spec.json`; Angular production build passed.
- Known pre-existing failures: the broad legacy `tsconfig.spec.json` test
  compilation still fails on unrelated stale specs and missing Node types;
  focused billing configuration passes. Existing build budget/CommonJS and npm
  audit warnings remain.
- Schema / production / security / accounting / external impact: no backend,
  schema, data, authentication, authorization, accounting or CardCom change.
- Risks / manual checks: after frontend deployment, return from the saved
  checkout and verify the processing banner remains visible without the
  expired-trial dialog. A normal expired-trial login still shows the dialog.
- Documentation updated: `frontend/src/app/pages/my-account/AGENTS.md`.

## Integration

- Reviewed by: Codex primary integration manager; presentation-only boundary,
  reactive return context and unchanged backend enforcement reviewed.
- Integrated commit: `faf2d458` plus this task-record commit.
- Combined verification: focused ChromeHeadless 5/5 passed and Angular
  production build passed on `codex/integration-kt111`.
- `origin/main` verification: recorded after push in the final user report.
- User-visible run instructions: deploy frontend only. No backend, SQL, schema
  or environment update is required.
