# KT-113 - Checkout resolution gate

- Status: `READY_TO_PUSH`
- Task manager: Codex primary integration manager
- Worker: Codex
- Worktree: `C:\Users\harel\.codex\worktrees\kt113\taxmyself-dev`
- Branch: `codex/kt-113-checkout-resolution-gate`
- Base commit: `66c11cbce9f79011053164f479ec82cf72182a3f`

## Business outcome

A customer returning from CardCom remains on a dedicated payment-verification screen until the existing checkout reaches a safe terminal result. The customer never lands on the account home while payment activation is unresolved and is never offered a duplicate charge.

## Acceptance criteria

- [x] A CardCom checkout return is immediately routed from the configured return URL to `/billing/payment-status`, not rendered as a banner over `/my-account`.
- [x] The status page checks only the authenticated owner's canonical hosted checkout and uses read-only CardCom reconciliation; it never creates or submits a charge.
- [x] Verified capture completes through the existing idempotent hosted-completion path and navigates home only after the attempt is `COMPLETED` and subscription state is refreshed.
- [x] A provider-proven decline/cancel returns the customer to plan or recovery payment with a clear retry message and releases no uncertain attempt.
- [x] Pending, provider-unreachable and unknown results stay on the status page, never enable another payment, and do not spin forever without explanatory state.
- [x] Refresh, browser close/reopen and a later authenticated login recover the server-owned unresolved checkout without relying solely on sessionStorage.
- [x] A late webhook or late reconciliation result resolves the same screen without creating another attempt.
- [x] Focused backend and frontend tests cover success, decline, pending, unknown/transport failure, timeout, refresh/re-entry, late completion and duplicate-payment prevention.

## Scope and constraints

- In scope: billing checkout status API, server-owned pending-checkout projection, CardCom return routing, dedicated frontend status page, guards/startup routing needed for re-entry, focused tests and topic documentation.
- Out of scope: new payment flows, schema/data migrations, CardCom credentials or URLs, production access/deployment, changes to amounts/VAT/receipts/accounting.
- Required reading: root `AGENTS.md`, coordination workflow/authority/quality gates, backend billing AGENTS, frontend billing/my-account/guard AGENTS.
- Approval boundaries: no schema, production data, external API contract, credential or deployment change.

## Handoff

- Result: complete
- Commit hash(es): `c6ff86bb9f4e2e2dfacb72aea85229e1e3226221`
- Changed files: billing controller/service/tests/docs; Angular billing state,
  guard/routing, plans/recovery, new payment-status page/tests/config, and topic docs.
- Tests and exact results: worker backend 6 suites / 140 tests passed; worker
  frontend 35 tests passed; Nest build passed; Angular production build passed
  (hash `74f63c962df56fbb`). Integrated main backend focused 2 suites / 23 tests
  passed. `git diff --check` and `git show --check` passed.
- Known pre-existing failures: Angular integration rerun could not start Chrome
  Headless after two attempts because the local Windows Chrome GPU process/cache
  crashed before loading specs. The identical committed source had already run
  the same 35 specs successfully in the isolated worker, and its production
  build passed. Existing Angular bundle/style budget warnings remain unchanged.
- Schema / production / security / accounting / external impact: no schema/data/accounting change; authenticated owner-only status lookup; read-only provider inspection only.
- Risks and manual checks: CardCom itself cannot be simulated fully in unit
  tests. Before production deployment, run one dev hosted checkout, return from
  CardCom, refresh/close/reopen while pending, and confirm the dashboard appears
  only after completion. No production operation was performed.
- Documentation updated: backend billing, frontend billing, billing guard and
  my-account topic AGENTS files.

## Integration

- Reviewed by: Codex primary integration manager
- Integrated commit: `c6ff86bb9f4e2e2dfacb72aea85229e1e3226221` (fast-forward)
- Combined verification: backend 140/140, frontend 35/35, both production builds;
  integrated-tree backend 23/23. Browser-launch environment issue recorded above.
- `origin/main` verification: pending push
- User-visible run instructions: restart local backend/frontend, use the billing
  QA user, start a checkout, return/back/refresh/close and reopen. Expect the
  dedicated verification page until the same server-owned attempt completes.
