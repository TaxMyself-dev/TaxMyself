## Purpose

Repository-level operational entrypoints that coordinate verified releases
across the backend Cloud Run service, private smoke jobs, and Firebase Hosting.

## Key files

- `deploy.cmd` / `deploy.ps1` — single-command production release orchestrator with
  `Full`, `Backend`, and `Frontend` targets, an optional local-test skip,
  zero-traffic backend candidate, readiness, exact-image job configuration,
  frontend backup/deploy, full smoke, and rollback.
- `tests/production-release-state.json` — read-only fixture proving sequential
  release numbering and target selection without cloud access.
- `tests/production-release-state-invalid.json` — invalid traffic-split fixture
  proving stage and failure-reason diagnostics.
- `tests/deploy.Tests.ps1` — syntax, fixture, sequence, target, stage-order,
  immutable-revision, and failure-diagnostic regression checks.

## Main flow

1. Require a clean `main` exactly matching `origin/main` and authenticated
   deployment sessions.
2. Allocate `rYYYYMMDD-HHmmss-NNNN` from prior script-created Cloud Run
   revision names.
3. Verify/build locally, deploy a zero-traffic candidate from a clean Git
   archive, and run readiness on its tagged URL.
4. Configure private smoke jobs from the candidate's immutable image, promote
   the exact revision, deploy/test a Firebase preview, back up live, promote
   the exact preview version, and run full smoke.
5. On a post-promotion failure, attempt frontend and backend rollback while
   retaining the original failed stage and reason.

Backend-only releases keep candidate readiness, immutable smoke-job updates,
exact-revision promotion, live compatibility smoke, and backend rollback.
Frontend-only releases keep the production build, preview smoke, live backup
and promotion, live compatibility smoke, and frontend rollback.

## Invariants

- Running `scripts\deploy` immediately starts the guarded release; the default
  target is `Full`, while positional `backend` and `frontend` scope it.
- `scripts\deploy -Help` (also `-h`) is side-effect free and must return
  before log creation, authentication, preflight, or any cloud command.
- `Target` defaults to `Full`. `SkipLocalTests` may skip only local Jest and
  smoke configuration unit tests; it must never skip builds, candidate
  readiness, browser smoke, full live signup/login/cleanup smoke, or rollback.
- Never deploy a dirty tree, a branch other than `main`, or a commit different
  from `origin/main`.
- Never use `LATEST` for traffic promotion or mutable image tags for smoke
  jobs; bind both to the exact candidate revision/image.
- Do not run schema migrations, cutover SQL, or production-data maintenance.
- Never print or persist production environment values or credentials.
- Deployment authentication comes only from existing gcloud, Firebase CLI,
  and Git Credential Manager sessions. Every release begins by refreshing the
  sessions required by its target. Never accept passwords as script parameters
  or store credentials in the repository.
- Every stage reports START and COMPLETE, or FAILED with its stage and reason.
- A failed zero-traffic Cloud Run deployment queries only ERROR entries for the
  exact expected revision whose message prefix is explicitly allowlisted. The
  local parser then requires the complete known-safe shape and reconstructs the
  terminal diagnosis from constrained captures. Arbitrary application errors,
  raw logging JSON and stack traces are never retrieved or persisted; an
  unknown error or inability to read logs preserves the original `gcloud`
  failure. The current allowlist contains only catalog-integrity failures.
- Detailed command, test, build, and cloud output streams in real time to the
  git-ignored `deployment-logs/` file printed once at startup; routine details
  and dependency warnings do not flood the operator terminal.
- Native CLI stderr is diagnostic output, not failure by itself. Preserve it in
  the detailed log and classify native success/failure only by exit code;
  PowerShell/cmdlet exceptions remain terminating.
- A child smoke process may expose a concise terminal reason only through the
  explicit `[SMOKE FATAL]` marker. All unmarked child output stays confined to
  the detailed log, preventing arbitrary test/application output from being
  promoted to the operator console.

## Related topics

- `smoke-tests/AGENTS.md` — candidate and post-deployment smoke entrypoints.
- `docs/operations/production-smoke.md` — operator release and rollback policy.
