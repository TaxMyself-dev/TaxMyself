# KT-051 — Prorated upgrades and scheduled downgrades

- Status: COMPLETE (local implementation; live dev acceptance remains)
- Branch: codex/billing-debt-recovery
- Base: 6d565e51
- Authorization: Elazar approved immediate prorated upgrades, scheduled
  next-renewal downgrades, cancellation and clear pre-confirmation amounts.
- Supersedes KT-049 full-price plan-change behavior for newly opened checkouts.
- Scope: provider-free preview; frozen paid current-period terms; immutable
  prorated upgrade reservation; preserve original service dates/anchor;
  one invoice for the difference; next renewal uses target full monthly rate;
  append-only scheduled downgrade/cancellation under subscription lock;
  existing canonical recovery and owner authorization. No new schema.
- Pending requests/snapshots use existing billing_event JSON with a scoped
  policy and atomic writes. No best-effort audit writes for operational state.
- No push, production, dev data mutations or live provider calls.
- Verify backend billing tests/build and focused frontend tests/build.

## Delivered

- Owner preview and ten-minute confirmation quote; immediate positive
  difference charge based on frozen paid terms and exact remaining period.
- Atomic upgrade snapshot/reservation before provider I/O, preserved billing
  dates/anchor, one difference invoice, idempotent completion and retry.
- Next-renewal downgrade schedule, exact-request cancellation, pending status
  in plans/settings, renewal application before canonical pricing/charge.
- Zero-cost upgrade without a provider transaction. Existing in-flight legacy
  full-price upgrades retain their original completion policy.

## Verification and impact

- Backend `npx jest --runInBand src/billing --silent`: 28 suites / 408 tests
  passed. Subsequent focused BillingService/plan-change run: 2 suites / 84
  tests passed, including four further quote/schedule/zero-charge tests.
- Focused frontend plans/recovery/state/admin subscriptions: 25 tests passed.
- Backend Nest build and frontend production build passed. Angular reports
  existing bundle/style budgets and CommonJS dependency warnings.
- Transaction mocks verify subscription locking, owner scope, stale schedule
  cancellation, mandatory snapshot-write rollback, receipt retry, late capture
  rejection and scheduled target use before canonical renewal charge.
- No schema/production/dev-data/provider mutation. Existing billing_event JSON
  is used transactionally for scoped operational commands. No accounting
  module changes; invoice issuance reuses the canonical receipt pipeline.
- New owner-only cancel API and preview/checkout fields; CardCom contract is
  unchanged. No dependencies, secrets, env or generated artifacts committed.
- Pending manual dev checks: real prorated checkout and receipt, then scheduled
  downgrade/cancel with the existing admin renewal runner. No live end-to-end
  test was performed. Missing reliable legacy paid terms fail closed for
  support review; a due downgrade takes effect during daily/admin renewal.
- No push or integration into main; parallel chat worktree untouched.
