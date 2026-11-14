# KT-109 - Resume existing hosted checkout automatically

- Status: `APPROVED`
- Task manager: Codex primary integration manager
- Worker: Codex task worker
- Worktree: pending
- Branch: `codex/kt-109-resume-hosted-checkout`
- Base commit: `eb68742cc9ee1cf5756a9b1f03eb5055f2da9231`

## Business outcome

When a customer retries an initial subscription purchase after leaving CardCom,
Keepintax safely resumes or resolves the existing hosted checkout instead of
appearing unresponsive or requiring support to locate the old payment page.

## Acceptance criteria

- [ ] A repeated initial-purchase checkout with a persisted CardCom LowProfile
  and safe hosted URL performs the existing read-only provider inspection.
- [ ] Pending or unknown provider state redirects to the same saved CardCom URL
  and does not create a second billing attempt or provider checkout.
- [ ] A provider-proven final decline releases the old attempt and permits one
  fresh hosted checkout using the current confirmed request.
- [ ] Captured/completed state never creates another charge and returns a safe
  processing/completed outcome.
- [ ] Missing or unsafe persisted checkout context fails closed with a visible
  customer-facing error.
- [ ] Billing page HTTP failures are visibly presented rather than emitted only
  through an unconsumed toast stream.
- [ ] Focused backend/frontend tests and the Nest/Angular builds pass.

## Scope and constraints

- In scope: initial `TRIAL`/`TRIAL_EXPIRED` hosted checkout continuation,
  reuse of the canonical CardCom inspection path, billing-page error UX, tests,
  and billing topic documentation.
- Out of scope: production data changes, schema changes, CardCom API contract
  changes, automatic expiry assumptions, and PAST_DUE policy changes.
- Required reading: root `AGENTS.md`, `backend/src/billing/AGENTS.md`,
  `frontend/src/app/pages/billing/AGENTS.md`, and coordination workflow/gates.
- Approval boundaries: no production access or deployment; no new attempt is
  allowed unless CardCom proves the existing attempt definitively declined.

## Handoff

- Result:
- Commit hash(es):
- Changed files:
- Tests and exact results:
- Known pre-existing failures:
- Schema / production / security / accounting / external impact:
- Risks and manual checks:
- Documentation updated:

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
