# KT-109 - Resume existing hosted checkout automatically

- Status: `PUSHED`
- Task manager: Codex primary integration manager
- Worker: Codex task worker
- Worktree: `C:/Users/harel/.codex/worktrees/kt109/taxmyself-dev`
- Branch: `codex/kt-109-resume-hosted-checkout`
- Base commit: `62dc3c0acf338e0111e230097c4e1c4d549ee5d5f`

## Business outcome

When a customer retries an initial subscription purchase after leaving CardCom,
Keepintax safely resumes or resolves the existing hosted checkout instead of
appearing unresponsive or requiring support to locate the old payment page.

## Acceptance criteria

- [x] A repeated initial-purchase checkout with a persisted CardCom LowProfile
  and safe hosted URL performs the existing read-only provider inspection.
- [x] Pending or unknown provider state redirects to the same saved CardCom URL
  and does not create a second billing attempt or provider checkout.
- [x] A provider-proven final decline releases the old attempt and permits one
  fresh hosted checkout using the current confirmed request.
- [x] Captured/completed state never creates another charge and returns a safe
  processing/completed outcome.
- [x] Missing or unsafe persisted checkout context fails closed with a visible
  customer-facing error.
- [x] Billing page HTTP failures are visibly presented rather than emitted only
  through an unconsumed toast stream.
- [x] Focused backend/frontend tests and the Nest/Angular builds pass.

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

- Result: complete
- Commit hash(es): `bb957ca9f9f69c4f4c626c9795c848c5558d0897`
- Changed files: `billing.service.ts` and spec; billing plans page TS/HTML/SCSS
  and spec; backend/frontend billing `AGENTS.md`; this task file.
- Tests and exact results: backend focused Jest 70/70 passed; frontend focused
  Karma/ChromeHeadless 9/9 passed; Nest build passed; Angular build passed.
- Known pre-existing failures: none. Angular build retained existing style and
  initial-bundle budget warnings plus existing CommonJS warnings.
- Schema / production / security / accounting / external impact: no schema,
  production-data, authentication, accounting, tax or CardCom contract change.
  Existing read-only CardCom reconciliation is reused and no provider call is
  submitted unless the canonical flow safely reserves a new attempt.
- Risks and manual checks: after deployment, retry subscription 67 from the
  plans page and verify it redirects to attempt 11's existing CardCom page with
  no new billing attempt or LowProfile creation.
- Documentation updated: backend billing and frontend billing topic maps.

## Integration

- Reviewed by: Codex primary integration manager; full diff, ownership,
  duplicate-charge safety, URL allowlist and failure atomicity reviewed.
- Integrated commit: `bb957ca9f9f69c4f4c626c9795c848c5558d0897`
- Combined verification: focused backend Jest passed 70/70; focused frontend
  ChromeHeadless passed 9/9; Nest and Angular production builds passed on the
  integration branch. Angular emitted only the existing budget/CommonJS
  warnings.
- `origin/main` verification: delivery commit verification recorded in the
  final task report after push.
- User-visible run instructions: no schema or environment step. Deploy backend
  and frontend normally, then sign in as subscription 67 and click the plan.
  The existing attempt 11 should be checked and its saved CardCom page resumed;
  verify no new attempt or LowProfile row is created.
