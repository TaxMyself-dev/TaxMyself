## Purpose

Repository-level operational entrypoints that coordinate verified releases
across the backend Cloud Run service, private smoke jobs, and Firebase Hosting.

## Key files

- `Deploy-Production.ps1` — plan/apply production release orchestrator with
  zero-traffic backend candidate, readiness, exact-image job configuration,
  frontend backup/deploy, full smoke, and rollback.
- `tests/production-release-state.json` — read-only fixture proving sequential
  release numbering and plan output without cloud access.
- `tests/production-release-state-invalid.json` — invalid traffic-split fixture
  proving stage and failure-reason diagnostics.
- `tests/Deploy-Production.Tests.ps1` — syntax, plan, sequence, stage-order,
  immutable-revision, failure-diagnostic, and apply-guard regression checks.

## Main flow

1. Require a clean `main` exactly matching `origin/main` and explicit apply
   authorization.
2. Allocate `rYYYYMMDD-HHmmss-NNNN` from prior script-created Cloud Run
   revision names.
3. Verify/build locally, deploy a zero-traffic candidate from a clean Git
   archive, and run readiness on its tagged URL.
4. Configure private smoke jobs from the candidate's immutable image, promote
   the exact revision, deploy/test a Firebase preview, back up live, promote
   the exact preview version, and run full smoke.
5. On a post-promotion failure, attempt frontend and backend rollback while
   retaining the original failed stage and reason.

## Invariants

- Default behavior is plan-only. Apply requires
  `KEEPINTAX_PRODUCTION_DEPLOY=taxmyself-prod` and `-Apply`.
- Never deploy a dirty tree, a branch other than `main`, or a commit different
  from `origin/main`.
- Never use `LATEST` for traffic promotion or mutable image tags for smoke
  jobs; bind both to the exact candidate revision/image.
- Do not run schema migrations, cutover SQL, or production-data maintenance.
- Never print or persist production environment values or credentials.
- Deployment authentication comes only from existing gcloud, Firebase CLI,
  and Git Credential Manager sessions. Apply begins by refreshing the gcloud
  and Firebase sessions interactively. Never accept passwords as script
  parameters or store credentials in the repository.
- Every stage reports START and COMPLETE, or FAILED with its stage and reason.
- A failed zero-traffic Cloud Run deployment reads only ERROR entries for the
  exact expected revision and promotes one concise, redacted application-error
  line into the Stage 8 failure. Raw logging JSON and stack traces remain out of
  terminal output and the release log; inability to read logs preserves the
  original `gcloud` failure.
- Detailed command, test, build, and cloud output streams in real time to the
  git-ignored `deployment-logs/` file printed once at startup; routine details
  and dependency warnings do not flood the operator terminal.
- Native CLI stderr is diagnostic output, not failure by itself. Preserve it in
  the detailed log and classify native success/failure only by exit code;
  PowerShell/cmdlet exceptions remain terminating.

## Related topics

- `smoke-tests/AGENTS.md` — candidate and post-deployment smoke entrypoints.
- `docs/operations/production-smoke.md` — operator release and rollback policy.
