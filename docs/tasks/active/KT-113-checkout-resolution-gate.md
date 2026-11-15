# KT-113 - Checkout resolution gate

- Status: `APPROVED`
- Task manager: Codex primary integration manager
- Worker: Codex
- Worktree: `C:\Users\harel\.codex\worktrees\kt113\taxmyself-dev`
- Branch: `codex/kt-113-checkout-resolution-gate`
- Base commit: `66c11cbce9f79011053164f479ec82cf72182a3f`

## Business outcome

A customer returning from CardCom remains on a dedicated payment-verification screen until the existing checkout reaches a safe terminal result. The customer never lands on the account home while payment activation is unresolved and is never offered a duplicate charge.

## Acceptance criteria

- [ ] A CardCom checkout return is immediately routed from the configured return URL to `/billing/payment-status`, not rendered as a banner over `/my-account`.
- [ ] The status page checks only the authenticated owner's canonical hosted checkout and uses read-only CardCom reconciliation; it never creates or submits a charge.
- [ ] Verified capture completes through the existing idempotent hosted-completion path and navigates home only after the attempt is `COMPLETED` and subscription state is refreshed.
- [ ] A provider-proven decline/cancel returns the customer to plan or recovery payment with a clear retry message and releases no uncertain attempt.
- [ ] Pending, provider-unreachable and unknown results stay on the status page, never enable another payment, and do not spin forever without explanatory state.
- [ ] Refresh, browser close/reopen and a later authenticated login recover the server-owned unresolved checkout without relying solely on sessionStorage.
- [ ] A late webhook or late reconciliation result resolves the same screen without creating another attempt.
- [ ] Focused backend and frontend tests cover success, decline, pending, unknown/transport failure, timeout, refresh/re-entry, late completion and duplicate-payment prevention.

## Scope and constraints

- In scope: billing checkout status API, server-owned pending-checkout projection, CardCom return routing, dedicated frontend status page, guards/startup routing needed for re-entry, focused tests and topic documentation.
- Out of scope: new payment flows, schema/data migrations, CardCom credentials or URLs, production access/deployment, changes to amounts/VAT/receipts/accounting.
- Required reading: root `AGENTS.md`, coordination workflow/authority/quality gates, backend billing AGENTS, frontend billing/my-account/guard AGENTS.
- Approval boundaries: no schema, production data, external API contract, credential or deployment change.

## Handoff

- Result:
- Commit hash(es):
- Changed files:
- Tests and exact results:
- Known pre-existing failures:
- Schema / production / security / accounting / external impact: no schema/data/accounting change; authenticated owner-only status lookup; read-only provider inspection only.
- Risks and manual checks:
- Documentation updated:

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
