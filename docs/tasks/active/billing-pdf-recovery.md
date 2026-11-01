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

## Receipt email follow-up (2026-11-01)
- Status: MANAGER_REVIEW; current chat owns this continuation.
- Follow-up base commit: 81e70ad2; existing feature continued without integration.
- Scope: admin resend existing payment/renewal invoice; failed email retry with existing PDF; no charge, new document, schema, production, merge or push.
- Acceptance: admin authorization, existing-document validation, mail failure scheduling, concurrency protection, focused tests and builds.

### Follow-up result and validation

- Implemented admin resend for PAYMENT_SUCCESS / RENEWAL_SUCCESS using only the
  saved PDF. The pending list now includes unsent emails with linked documents.
- Shared transactional event-row lease and metadata backoff cover automatic,
  manual and post-capture sends. Due failed email events are recovered separately
  from attempt status, including COMPLETED and legacy events. No new cron or
  Cloud Tasks implementation; existing minute runner retained.
- Main focused backend run: 11 suites / 129 tests passed, exit 0:
  `npm test -- --runInBand --silent --runTestsByPath src/billing/services/billing-receipt-email.spec.ts src/billing/services/billing-receipt.service.spec.ts src/billing/services/billing-completion-recovery.service.spec.ts src/billing/services/billing-event.service.spec.ts src/billing/services/admin-billing.service.spec.ts src/billing/admin-billing.controller.spec.ts src/billing/services/subscription-renewal.recovery.spec.ts src/billing/services/subscription-renewal.decline-policy.spec.ts src/billing/services/cardcom-webhook.recovery.spec.ts src/billing/services/cardcom-webhook.post-capture.spec.ts src/billing/billing.module.spec.ts`.
- Additional regression run passed refund/lifecycle/hosted-completion and recovery:
  4 suites / 79 tests passed. That invocation also incorrectly named two nonexistent
  spec files (ENOENT, overall exit 1); corrected renewal/webhook file paths are in
  the successful final 11-suite command above. No product failure was suppressed.
- Frontend: 3 tests passed, exit 0:
  `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.receipt-email.spec.json --include=src/app/shared/admin-billing/pending-receipts/pending-receipts.component.spec.ts`.
- Backend `npm run build`: passed on final executable code, exit 0.
- Frontend `npm run build -- --configuration production`: passed, exit 0;
  warnings for stylesheet/initial-bundle budgets and exceljs/lodash CommonJS.
  No budget/config change or unrelated optimization was made.
- Initial non-elevated builds/frontend tests hit worktree-output EPERM. Successful
  reruns used narrowly approved worktree access. Independent dependencies retained.
- Full diff reviewed; `git diff --check` passed. Tests use mocks, not live DB,
  CardCom, storage or Brevo. No application was started, live mail sent, schema/data
  changed, or production accessed. Manual dev/crash/multi-instance/storage/provider
  integration verification remains in docs/features/billing-pdf-recovery.md.
- Risks: provider acceptance followed by transport/DB failure can duplicate email;
  five-minute leases do not promise exactly-once delivery after crashes/expiry.
  Stored recipient absence is an explicit skip. No charge, new invoice, journal
  or subscription write is reachable from the new admin/email-only recovery path.
- Documentation: billing AGENTS, admin-billing AGENTS, billing-pdf-recovery feature
  guide and this task file. No governance/shared worklog edits.
- Not merged into main, pushed or deployed. Personal manual-main-test/push gate
  remains binding; no push approval is inferred from this task.

- Final compatibility review preserved the existing customer PAYMENT_SUCCESS
  resend action by passing explicit manual intent to the shared delivery claim;
  ownership/type rules are unchanged. Added an ownership/resend regression test.
  `npm test -- --runInBand --silent --runTestsByPath src/billing/services/billing-receipt-email.spec.ts src/billing/services/billing.service.spec.ts`:
  2 suites / 83 tests passed, exit 0. Backend build rerun afterwards passed,
  exit 0. Changes since the successful frontend build/tests were backend code
  plus comments/documentation only. Across successful runs: 15 distinct backend
  suites / 269 distinct tests, plus 3 isolated frontend tests; no live integration.
