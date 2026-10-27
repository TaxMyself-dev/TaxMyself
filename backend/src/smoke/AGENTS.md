## Purpose

Production smoke-test support that is compiled into the backend image but does
not run as part of the HTTP application. It provides the guarded cleanup job
used after a synthetic signup test.

## Key files

- `../readiness.service.ts` — public read-only deployment gate that verifies DB
  connectivity and signup-critical TypeORM schema metadata against the
  connected database.
- `cleanup-smoke-user.ts` — standalone Cloud Run Job entrypoint. It initializes
  only MySQL, Firebase Admin, and a service-account Google Drive client; it
  never boots `AppModule` and does not require the system-user Drive OAuth
  credentials used by normal document operations.
- `verify-smoke-user.ts` — separate least-privilege Firebase-only Job entrypoint
  that marks the exact synthetic email verified before the login phase.
- `smoke-user-cleanup.ts` — environment-independent safety rules and cleanup
  orchestration.
- `smoke-email-verifier.ts` — guarded verification orchestration.
- `smoke-user-cleanup.spec.ts` — destructive-boundary and retry-safety tests.

## Invariants

- `/ready` returns generic failure state to callers and logs schema detail only
  server-side; it never writes data or exposes missing table/column names.
- Never expose smoke cleanup through a public HTTP controller.
- Email verification also remains a private Job and requires its own explicit
  enable flag.
- Cleanup requires `SMOKE_CLEANUP_ENABLED=true`, the compiled expected database
  `keepintax-prod`, the hard-coded `smoke-test@keepintax.co.il` identity, and a
  user/folder name derived exactly from the guarded run id.
- Smoke runs are serial because Firebase permits only one user with the fixed
  smoke email. A leftover user is a failed-cleanup signal, not permission to
  broaden or guess deletion targets.
- Resolve the UID independently from Firebase and the DB; disagreement is a
  hard failure before any deletion.
- Reused smoke email addresses are disambiguated by the exact guarded folder
  name derived from `runId`. Unrelated stale smoke rows never broaden the
  deletion target, and a Firebase identity without an attributable exact DB
  row is not deletion authority.
- Delete Drive content only by the exact guarded folder name under the system
  root. A stored folder ID alone is never deletion authority, and duplicate
  exact-name folders are a hard failure.
- Do not disable foreign keys. Unexpected user data must block cleanup rather
  than broaden deletion.
- External deletion is retry-safe; database deletion is transactional and
  constrained by both UID and email.
- Database cleanup also removes legacy `user_module_subscription` rows,
  requires exactly one user deletion when the run row existed, and verifies
  that the exact run row is absent before reporting success.
- Unit tests and builds use mocks only. Live production execution, credentials,
  and job deployment require explicit production approval.
