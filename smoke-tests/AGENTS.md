## Purpose

External Playwright production smoke suite and guarded operator scripts. It
targets only explicitly supplied HTTPS deployments and verifies the deployed
backend, frontend, signup, Firebase verification, login, and cleanup flow.

## Key files

- `config.js` — explicit URL and fixed synthetic-identity validation.
- `tests/production-readiness.spec.js` — candidate backend `/ready` gate,
  including the explicit `keepintax-prod` database-target assertion.
- `tests/production-readonly.spec.js` — deployed registration-page/API-origin
  check with no writes; it requires `GET /auth/get-cities` to return 200 and
  reports failed requests on the deployed frontend/backend origins with the
  status, method, and URL.
- `tests/production-signup.spec.js` and `production-login.spec.js` — synthetic
  registration and authenticated dashboard checks.
- `run-signup-smoke.js` — ordered signup, private verification job, login, and
  guaranteed cleanup-job orchestration.
- `inspect-cloud-run-source.ps1` and `configure-cloud-run-jobs.ps1` — redacted
  production configuration inventory and double-gated private job setup; job
  configuration accepts only an immutable `@sha256` image reference.
- `run-candidate-readiness.ps1` and `run-production-smoke.ps1` — guarded
  operator entrypoints for pre-traffic and post-deployment checks.

Registration controls are located through their visible labels in
`registration-locators.js`; the suite does not rely on Angular directive
attributes that may be absent from rendered DOM. The signup runner emits one
bounded `[SMOKE FATAL]` reason for the quiet release console while detailed
child-process output remains in the deployment log.
For a diagnostic against a rolled-back production version,
`run-production-smoke.ps1 -SignupFlowOnly` runs only the write-capable
registration, verification, login, and guaranteed cleanup chain. The normal
release path does not set this switch and retains readiness/read-only gates.

## Main flows

1. Run candidate readiness against the exact tagged Cloud Run revision before
   moving production traffic, then configure both private jobs from that
   candidate's exact immutable image digest.
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
- Cloud Run job dictionary flags use comma-separated `KEY=VALUE` entries only:
  plain values cross the boundary as Base64 and secret references use Cloud
  resource names, so comma/newline input must be rejected before invoking
  gcloud.

## Related topics

- `backend/src/smoke/AGENTS.md` — private Firebase verification and destructive
  cleanup boundaries.
- `docs/operations/production-smoke.md` — operator release order and rollback
  policy.
- `frontend/src/app/pages/register/AGENTS.md` and
  `frontend/src/app/pages/login/AGENTS.md` — browser flows exercised by the
  suite.
