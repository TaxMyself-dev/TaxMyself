# KT-111 - Suppress trial dialog during checkout return

- Status: `APPROVED`
- Task manager: Codex primary integration manager
- Worker: Codex sequential worker
- Worktree: `C:/Users/harel/.codex/worktrees/kt111/taxmyself-dev`
- Branch: `codex/kt-111-checkout-return-dialog`
- Base commit: `d22436db74b95ba6ba133a082e439fd04e2b9d20`

## Business outcome

A customer returning from CardCom sees one coherent payment-processing banner,
without the expired-trial plan-selection dialog covering it or inviting another
payment attempt.

## Acceptance criteria

- [ ] The billing state exposes a reactive, exact hosted-checkout return context.
- [ ] The global blocking dialog is suppressed while that checkout return
  context is active.
- [ ] Backend access enforcement and duplicate-charge protection are unchanged.
- [ ] Ordinary TRIAL_EXPIRED sessions without a checkout return still show the
  plan-selection dialog.
- [ ] Focused frontend tests and Angular production build pass.

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
