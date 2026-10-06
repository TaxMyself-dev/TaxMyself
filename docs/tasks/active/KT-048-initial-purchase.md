# KT-048 — Canonical initial subscription purchase

- Status: COMPLETE
- Branch: codex/billing-debt-recovery
- Base: 5cde000fb3aff53cee31e7984b26eebfa2fa0939
- Authorization: Elazar approved the initial-purchase implementation plan.
- Scope: first purchase from TRIAL/TRIAL_EXPIRED; persisted checkout obligation,
  linked hosted attempt, verified capture, activation/card recovery and receipt
  completion through existing canonical services. Preserve legacy checkout
  callbacks and existing upgrade/recovery behavior. No push or live charges.
- Acceptance: abandoned initial checkout creates no recurring debt; concurrent
  checkouts cannot duplicate payment; access starts only after verified capture;
  period starts at capture; completion retries cannot extend it or duplicate
  receipt; uncertain outcomes remain blocked and available in admin.
- Verification: focused billing Jest suites, backend build; affected frontend
  tests/build when frontend changes are made. No new schema planned.

## Implementation and verification

- CHECKOUT obligation and linked hosted attempt are reserved before provider
  I/O; eligibility/pending checks serialize under the subscription row lock.
- Verified initial capture bypasses legacy activation. Actual checkout service
  dates and subscription activation commit together using the captured time.
  Receipt failures resume the same attempt without recharging or extending.
- Verified webhook card data is validated/encrypted directly; missing webhook
  recovery retains the lookup-only fallback and newer-card protection.
- Checkout return carries its LowProfile id in tab-local session storage;
  billing/me filters payment events/logs by that attempt and owner. Cached or
  in-flight results for another context cannot appear as the new payment.
- Background billing refresh does not remount blocking UI; pending copy does
  not claim success before verification.
- `node node_modules/jest/bin/jest.js --runInBand --testPathPattern=src/billing/`:
  exit 0, 25 suites / 370 tests passed, including renewal/debt regressions.
- Backend `npm run build`: exit 0.
- Frontend production `npm run build`: exit 0; existing initial bundle/style
  budget and CommonJS warnings remain.
- Focused Angular ChromeHeadless run with tsconfig.billing-purchase.spec.json:
  exit 0, 19 tests passed (admin drawer, recovery, billing state).
- An initial accidentally broad Jest selection matched the worktree directory
  name and was interrupted after unrelated UsersService fixture errors. No
  repository-wide test success is claimed; final selection used src/billing/.
- No schema, production, dev data or external provider was mutated. No live
  CardCom E2E executed; user testing requires a TRIAL/TRIAL_EXPIRED dev user,
  correct issuer configuration, billing frontend 4201/backend 3001 and ngrok.
- Topic docs updated: backend billing, frontend billing and my-account.
- Remaining scope: upgrade canonicalization is deferred; initial purchase is
  limited to first purchase from TRIAL/TRIAL_EXPIRED.
