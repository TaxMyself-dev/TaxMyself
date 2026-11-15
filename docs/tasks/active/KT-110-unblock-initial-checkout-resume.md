# KT-110 - Unblock initial checkout resume

- Status: `APPROVED`
- Task manager: Codex primary integration manager
- Worker: Codex sequential worker
- Worktree: `C:/Users/harel/.codex/worktrees/kt110/taxmyself-dev`
- Branch: `codex/kt-110-unblock-initial-checkout-resume`
- Base commit: `91d5bf274bb8cf8b33e445e0c017e0c7f1ae3ef3`

## Business outcome

A trial owner with an abandoned CardCom checkout can safely resume payment
instead of receiving the generic duplicate-payment conflict.

## Acceptance criteria

- [ ] Initial-purchase orchestration returns the exact existing blocking hosted
  CHECKOUT attempt to the resume flow instead of throwing before inspection.
- [ ] Pending/unknown provider state returns the saved safe CardCom URL without
  creating a new attempt or LowProfile page.
- [ ] Only a provider-proven final decline releases the old attempt and permits
  one replacement checkout.
- [ ] Unrelated or inconsistent open obligations still fail closed.
- [ ] A real orchestration-level regression test covers the production-shaped
  TRIAL_EXPIRED + OPEN CHECKOUT + UNKNOWN active-attempt case.
- [ ] Focused backend tests and the Nest build pass.

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

- Result:
- Commit hash(es):
- Changed files:
- Tests and exact results:
- Known pre-existing failures:
- Schema / production / security / accounting / external impact:
- Risks / manual checks:
- Documentation updated:

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
