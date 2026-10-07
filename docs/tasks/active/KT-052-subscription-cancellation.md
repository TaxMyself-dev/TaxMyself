# KT-052 — Owner subscription cancellation

- Status: COMPLETE (local implementation; manual dev acceptance pending)
- Worktree: billing-debt-recovery/TaxMyself
- Branch: codex/billing-debt-recovery
- Base commit: a975c5c7
- Authorization: Elazar approved cancellation at paid period end, continued
  paid access until then, withdrawal before effective time, retained debts,
  stopped accrual and renewals after cancellation. Open banking follows the
  same module access gate; Feezback deletion is a separate task.

## Acceptance criteria

- Owner can confirm cancellation in My Subscription and withdraw a future
  request. Delegation, impersonation and complimentary access cannot mutate.
- Paid access continues until the exact paid end and then blocks all modules,
  including open banking, independently of cron timing.
- No future renewal or new debt after cutoff; old obligations remain.
- Pending payment outcomes cannot be silently discarded or overwritten.
- Cancellation supersedes scheduled downgrade; withdrawal does not restore it.
- Mandatory transactional history and stale-request checks; no new schema.
- Focused backend/frontend tests and both builds pass; local commit only.

## Scope and impact

- Existing subscription fields and scoped billing_event metadata only.
- No production, dev data mutation, provider call, refund, Feezback contract
  change, push or edits to the parallel chat checkout.
- Non-paid or already overdue subscriptions end immediately without access
  restoration; they cannot withdraw cancellation after effective time.

## Handoff

- Result: implemented owner cancellation and withdrawal in My Subscription.
- Backend `npx jest --runInBand src/billing --silent`: 29 suites, 437 tests
  passed. New tests cover confirmation/actor scope, subscription locking,
  idempotency, exact boundary, stale withdrawal, unresolved payment blocking,
  rollback, downgrade supersession, old debt preservation and no renewal charge.
- Frontend ChromeHeadless focused plans/recovery/state/admin subscriptions and
  My Subscription cancellation suite: 31 tests passed with
  tsconfig.billing-plan-change.spec.json.
- Backend Nest and frontend Angular production builds passed. Angular reports
  the same existing style/initial bundle budgets and CommonJS warnings.
- Dev information_schema read confirmed existing canceled_at/ended_at columns
  and SUBSCRIPTION_CANCELED enum support. No DDL or user data mutations.
- Schema / production / accounting / provider / Feezback deletion impact: none.
  Two owner mutation endpoints and pendingCancellation response field added.
  Existing professional/complimentary overrides remain intact. Access is
  checked at effective cancellation time, independently of daily persistence.
- Known limitation: an unresolved payment requires existing admin resolution
  before cancellation can be accepted; no assumption of unpaid provider state.
- Manual checks: confirm future cancellation, verify paid access and pending
  display, withdraw, then verify end-of-period blocking and admin renewal skip
  using a dedicated test fixture. No live payment or provider call required.
- Topic docs: backend billing, frontend settings and billing plans updated.
- Local billing branch only; no push/main integration or parallel chat edits.
