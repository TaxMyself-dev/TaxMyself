# Billing PDF completion recovery

- Status: `MANAGER_REVIEW`
- Task manager: current billing chat
- Worker: none
- Worktree: C:\Users\user\Keepintax\TaxMyself-admin-refunds
- Branch: codex/admin-refunds
- Base commit: ac2021ff3a6e263b8105a83444ec663055669b83

## Business outcome

Retry local PDF completion after a successful charge without waiting for the next
daily renewal batch, another charge or a replacement invoice.

## Acceptance criteria

- [x] Independent bounded recovery selects only due captured charges.
- [x] Durable 1/5/15/30 minute then hourly backoff, including crash recovery.
- [x] Exclusive lease and existing document/event/journal provenance are preserved.
- [x] Attempt links its existing invoice before PDF work; failure remains retryable.
- [x] Focused billing tests and backend build pass.

## Scope and constraints

- In scope: canonical local completion, retry schedule, diagnostic category, tests.
- Out of scope: old missing documents, accounting/numbering changes, schema,
  new admin UI/alert transport, renderer root cause, production access.
- Required reading: billing AGENTS, coordination workflow/authority/quality gates,
  lessons and production policy.
- Approval boundaries: local development only; no merge, push or deployment.
  Push requires Elazar's explicit manual test confirmation of current local main
  and explicit push approval under his personal instructions.

## Handoff

- Result: implemented and locally verified; ready for manual development testing.
- Tests: initial focused recovery run passed 6 suites / 145 tests. Final broad
  `npm test -- --runInBand --silent src/billing` passed 34 suites / 524 tests;
  one new assertion expected a refund claim result instead of the existing
  earlier rejection. Corrected that test only, then reran its full suite with
  `npm test -- --runInBand --silent --runTestsByPath src/billing/services/billing-attempt-orchestration.service.spec.ts`:
  1 suite / 52 tests passed. All 525 distinct billing tests are covered by these
  successful final checks. `npm run build` passed on the final executable code.
  Initial sandbox-only attempts could not write Jest cache/build output (EPERM);
  the successful checks ran with approved worktree write access.
- Review: complete scoped diff reviewed; git diff --check passed. No live DB,
  CardCom, signer, mail or storage integration was exercised; mocks only.
- Manual checks: follow docs/features/billing-pdf-recovery.md in keepintax-dev;
  no application server was started and no production repair was performed.
- Schema / production / security / accounting / external impact: no schema,
  production changes, authorization changes, accounting changes or API contract changes.
- Documentation: docs/features/billing-pdf-recovery.md and billing AGENTS.

## Integration

- Not integrated or pushed. Manual dev verification remains required.
