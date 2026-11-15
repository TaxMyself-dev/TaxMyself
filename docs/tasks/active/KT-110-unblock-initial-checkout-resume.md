# KT-110 - Unblock initial checkout resume

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary integration manager
- Worker: Codex sequential worker
- Worktree: `C:/Users/harel/.codex/worktrees/kt110/taxmyself-dev`
- Branch: `codex/kt-110-unblock-initial-checkout-resume`
- Base commit: `c44ac5e251026b5404f9dc10efd8847fd0afbd9f`

## Business outcome

A trial owner with an abandoned CardCom checkout can safely resume payment
instead of receiving the generic duplicate-payment conflict.

## Acceptance criteria

- [x] Initial-purchase orchestration returns the exact existing blocking hosted
  CHECKOUT attempt to the resume flow instead of throwing before inspection.
- [x] Pending/unknown provider state returns the saved safe CardCom URL without
  creating a new attempt or LowProfile page.
- [x] Only a provider-proven final decline releases the old attempt and permits
  one replacement checkout.
- [x] Unrelated or inconsistent open obligations still fail closed.
- [x] A real orchestration-level regression test covers the production-shaped
  TRIAL_EXPIRED + OPEN CHECKOUT + UNKNOWN active-attempt case.
- [x] Focused backend tests and the Nest build pass.

## Scope and constraints

- In scope: canonical initial-purchase reservation/orchestration, focused tests,
  and billing topic documentation.
- Out of scope: production data changes, schema changes, frontend changes,
  CardCom API changes, and any weakening of duplicate-charge protection.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`,
  `backend/src/billing/AGENTS.md`.
- Approval boundaries: no production access or deployment; no new provider page
  unless the existing provider result is definitively declined.

## Handoff

- Result: complete
- Commit hash(es):
- Changed files: billing attempt orchestration service and spec; backend billing
  topic documentation; this task file.
- Tests and exact results: combined billing service/orchestration Jest 127/127
  passed; final orchestration Jest 58/58 passed; Nest build passed.
- Known pre-existing failures: none. Existing dependency audit warnings remain.
- Schema / production / security / accounting / external impact: no schema,
  data, frontend, authentication, accounting or CardCom API contract changes.
  Duplicate-charge protection remains fail-closed outside the exact canonical
  hosted initial CHECKOUT.
- Risks / manual checks: after deployment retry subscription 67 and verify the
  saved CardCom page is resumed (or one replacement appears only after a
  provider-proven decline) without the generic 409.
- Documentation updated: `backend/src/billing/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
