# KT-097 - Production smoke tests and signup readiness

- Status: `PUSHED` (source delivery only; production setup and execution remain pending)
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `b6adcdab5fd118acfdb4d47bf4fda38496024ee8`

## Business outcome

Provide a safe, repeatable post-deployment signal that the deployed production
website, backend, authentication flow, and production schema needed by signup
still work together.

## Acceptance criteria

- [x] A readiness endpoint verifies database connectivity and the schema used
  by signup without writing data or exposing schema details to callers.
- [x] A browser smoke suite exercises the deployed production signup and login
  flow through the public frontend URL.
- [x] Synthetic signup data has an explicit, privileged cleanup path that
  removes all artifacts even after a failed test.
- [x] Deployment instructions run readiness before traffic promotion and the
  browser smoke suite after frontend deployment, with failure evidence and a
  documented rollback decision.
- [x] Focused tests and relevant production builds pass.

## Scope and constraints

- In scope: incremental implementation, beginning with backend readiness for
  signup-critical schema, followed by read-only Playwright smoke coverage and
  later safe synthetic-signup cleanup.
- Out of scope: deployment, live production access, production credentials,
  production database queries, schema changes, payments, document issuance,
  SHAAM calls, or live banking-provider calls.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`,
  `docs/coordination/AUTHORITY.md`, `docs/coordination/QUALITY_GATES.md`,
  `docs/coordination/PRODUCTION_POLICY.md`, `backend/src/users/AGENTS.md`, and
  `frontend/src/app/pages/register/AGENTS.md`.
- Approval boundaries: any schema/data change, authentication/security policy
  change, production access, credential use, deployment, or external-provider
  call requires explicit approval. The user approved commit and push of the
  locally verified source on 2026-10-26; no production action was authorized.

## Security-hardening follow-up

This is intentionally separate from delivering production smoke coverage.
Move `FIREBASE_PRIVATE_KEY`, `DB_PASSWORD`, and
`GOOGLE_SERVICE_ACCOUNT_JSON` from plain Cloud Run environment values to
Secret Manager references for the backend and both smoke jobs. Rotate any
credential whose handling history cannot be established, use dedicated
least-privilege runtime service accounts for verification and cleanup, and
re-run the redacted inventory until `secretsBackedBySecretManager` is true.
The current smoke setup must never print these values or persist them in a
repository file, build artifact, command transcript, or test report.

## Handoff

- Result: implementation complete and delivered to source control: backend readiness, read-only browser
  checks, guarded synthetic signup, Firebase email verification, production
  login, private cleanup, and the release/rollback runbook
- Commit hash(es): source-delivery commit containing this task record (see git
  history)
- Changed files: `backend/src/readiness.service.ts`,
  `backend/src/readiness.service.spec.ts`, `backend/src/app.controller.ts`,
  `backend/src/app.module.ts`, `backend/src/smoke/`, `backend/package.json`,
  `.gitignore`, `AGENTS.md`, the new `smoke-tests/` package, and this task
  record.
- Tests and exact results: readiness/environment/cleanup/verification Jest run
  passed (4 suites, 20 tests); Nest production build passed (exit 0); smoke
  configuration unit tests passed (8/8); the redacted Cloud Run inventory and
  job-plan fixtures passed for both Secret Manager and plain-value source
  configurations; Playwright discovered all four production tests; PowerShell
  syntax and destructive-production wrapper guards passed; JavaScript syntax
  validation passed. The compiled verification entrypoint rejected execution
  without `SMOKE_VERIFY_ENABLED=true`. The live smoke flow and private jobs
  were deliberately not executed because production access is outside this
  task.
- Known pre-existing failures:
- Schema / production / security / accounting / external impact: no schema or
  data mutation, production access, deployment, accounting behavior, external
  request, authentication, or authorization change. New public `GET /ready`
  performs read-only DB and `INFORMATION_SCHEMA` queries, returns generic
  failure details, and logs missing schema server-side.
- Risks and manual checks: not yet exercised against any live deployment by
  design. Activation depends on two separately configured private Cloud Run
  Jobs, reservation of `smoke-test@keepintax.co.il` for serial smoke runs, and
  an authorized first execution. The repository's existing production
  deployment documentation identifies the Cloud Run region as `me-west1`.
  Exact job configuration now waits only on the redacted output of the
  read-only `smoke-tests/inspect-cloud-run-source.ps1` inventory.
- Documentation updated: root topic map, `backend/src/smoke/AGENTS.md`, this
  task record, `smoke-tests/README.md`, and
  `docs/operations/production-smoke.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
