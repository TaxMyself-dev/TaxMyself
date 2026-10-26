## Purpose

External Playwright production smoke suite and guarded operator scripts. It
targets only explicitly supplied HTTPS deployments and verifies the deployed
backend, frontend, signup, Firebase verification, login, and cleanup flow.

## Key files

- `config.js` — explicit URL and fixed synthetic-identity validation.
- `tests/production-readiness.spec.js` — candidate backend `/ready` gate.
- `tests/production-readonly.spec.js` — deployed registration-page/API-origin
  check with no writes.
- `tests/production-signup.spec.js` and `production-login.spec.js` — synthetic
  registration and authenticated dashboard checks.
- `run-signup-smoke.js` — ordered signup, private verification job, login, and
  guaranteed cleanup-job orchestration.
- `inspect-cloud-run-source.ps1` and `configure-cloud-run-jobs.ps1` — redacted
  production configuration inventory and double-gated private job setup.
- `run-candidate-readiness.ps1` and `run-production-smoke.ps1` — guarded
  operator entrypoints for pre-traffic and post-deployment checks.

## Main flows

1. Run candidate readiness against the exact tagged Cloud Run revision before
   moving production traffic.
2. After backend traffic and frontend hosting are updated, run the full smoke
   sequence serially with the fixed `smoke-test@keepintax.co.il` identity.
3. Verify the synthetic Firebase user privately between signup and login, then
   always invoke private cleanup even when a browser phase fails.
4. Preserve Playwright artifacts and return a non-zero exit on any failed gate.

## Invariants

- Never infer production URLs or permit plain HTTP outside explicitly enabled
  localhost testing.
- Never place production credentials in this package, logs, fixtures, reports,
  or execution overrides.
- The write-capable production wrapper requires an explicit environment gate;
  job configuration requires a separate explicit apply gate.
- Full smoke runs are serial because Firebase permits only one user with the
  fixed smoke email.
- Adding a write-capable test requires an exact, retry-safe cleanup path before
  it joins the production sequence.
- Payments, official documents, SHAAM, and banking-provider calls are outside
  this suite unless separately designed and approved.

## Related topics

- `backend/src/smoke/AGENTS.md` — private Firebase verification and destructive
  cleanup boundaries.
- `docs/operations/production-smoke.md` — operator release order and rollback
  policy.
- `frontend/src/app/pages/register/AGENTS.md` and
  `frontend/src/app/pages/login/AGENTS.md` — browser flows exercised by the
  suite.
