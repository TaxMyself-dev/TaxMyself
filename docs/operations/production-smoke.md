# Production smoke-test runbook

This runbook verifies the deployed production revision itself. It must be run
by an authorized operator; repository agents do not access or deploy production.

## One-time setup

1. Reserve `smoke-test@keepintax.co.il` exclusively for production smoke tests.
   No mailbox alias is required because the private verification job marks the
   Firebase identity verified directly.
2. Create two private Cloud Run jobs from the production backend image:
   - verification: `node dist/smoke/verify-smoke-user.js`;
   - cleanup: `node dist/smoke/cleanup-smoke-user.js`.
3. Give verification Firebase Admin access only. Give cleanup only the DB,
   Firebase Admin, and Drive access required to remove signup artifacts.
4. Supply credentials through Secret Manager. The cleanup binary itself
   requires the connected database name to be exactly `keepintax-prod`.
5. Give the release runner permission to execute both jobs. Do not make either
   job public.

Start by running `smoke-tests/inspect-cloud-run-source.ps1` as an authorized
operator. Its read-only output contains no environment values or secret names
and is safe to use when preparing the exact job configuration.

Only after deploying a backend image that contains the smoke entrypoints,
preview `smoke-tests/configure-cloud-run-jobs.ps1`. Apply it with the explicit
`SMOKE_CONFIGURE_JOBS=taxmyself-prod` gate and `-Apply`. This creates or updates
the two private jobs but does not execute them. Security warnings about plain
values are tracked separately and do not block initial smoke delivery.

## Every deployment

1. Deploy the backend revision without promoting production traffic.
2. Point `SMOKE_API_URL` at that exact candidate revision and run
   `npm run smoke:readiness` from `smoke-tests/`. Do not promote the backend if
   `/ready` fails: the revision is not connected specifically to
   `keepintax-prod`, cannot reach it, or its signup-critical schema is
   incomplete. This authoritative check runs after the candidate build because
   only the deployed revision has the real runtime connection, but still runs
   at zero traffic before promotion.
3. Promote backend traffic only after the candidate readiness check succeeds.
4. Deploy the frontend.
5. Set the production web/API URLs, job names, GCP project, and region
   described in `smoke-tests/README.md`, then run
   `npm run smoke:signup`, or use the gated
   `smoke-tests/run-production-smoke.ps1` wrapper.
6. Treat any non-zero exit as a failed release. Preserve `smoke-tests/artifacts`
   and the two Cloud Run execution logs, restore the previous frontend release,
   and return backend traffic to the previous known-good revision. Investigate
   before attempting another deployment.
7. A zero exit means readiness, the public registration UI, the production
   signup API, Firebase user creation/verification, production login, dashboard
   routing, and cleanup all succeeded against the deployed environment.

The smoke result covers the tested path only. It is not a replacement for
monitoring, alarms, or broader regression tests.

Only one full smoke run may execute at a time because it uses a fixed Firebase
email address.

## Unified release script

`scripts\deploy` coordinates the complete flow and immediately starts a full
guarded release by default:

```powershell
.\scripts\deploy
```

To display all targets, options, and examples without starting a deployment:

```powershell
.\scripts\deploy -Help
```

The script never receives, stores, or bypasses an account password. Its first
stage explicitly launches the interactive login flows required by the target:

```powershell
gcloud auth login
firebase login --reauth
```

Only after both logins succeed does the preflight stage perform read-only checks
that the active sessions can access `taxmyself-prod`. An unauthorized session
stops the release before any build or deployment. Git authentication is checked
naturally by the required `git fetch origin`; Git Credential Manager may prompt
if its own session has expired.

The default target is the complete backend-and-frontend release. A scoped
release uses the same guarded flow:

```powershell
# Backend only: candidate, readiness, smoke jobs, traffic, and live smoke
.\scripts\deploy backend

# Frontend only: build, preview smoke, live backup/promotion, and live smoke
.\scripts\deploy frontend
```

For a faster release after the local suites have already passed on the exact
commit, `-SkipLocalTests` skips only the backend Jest suite and the smoke
configuration unit tests. It can be combined with any target:

```powershell
.\scripts\deploy -SkipLocalTests
```

There is intentionally no unverified direct-promotion mode. Dependency
installation, production builds, candidate readiness, preview browser smoke,
full production signup/login/cleanup smoke, and rollback remain mandatory.

Release identifiers use local date/time plus a monotonically increasing
sequence, for example `r20261026-191522-0042`. The sequence is derived from
prior revisions created by this script. Each stage prints `START` and `COMPLETE`;
failure output includes `FAILED`, the exact stage, and the exception reason.
When Cloud Run builds the image but the new zero-traffic revision fails during
startup, Stage 8 performs a read-only ERROR-log lookup scoped to that exact
revision and to explicitly allowlisted safe message prefixes. The local parser
also requires the complete approved message shape and reconstructs its output
from numeric captures; it never forwards arbitrary log text. The current
allowlist contains only catalog-integrity failures. Unknown errors, raw log
JSON, stack traces and secret-bearing free text are not retrieved or copied to
the terminal/deployment log. If no approved diagnosis is available or the
operator lacks log-read permission, the original `gcloud` error remains.

The terminal intentionally stays quiet during each stage. It prints the local
log path once, followed by stage status, concise failure/rollback status, and
the final outcome. Full npm, test, build, gcloud, Firebase and smoke output is
streamed in real time to a timestamped file under the git-ignored
`deployment-logs/` directory. To follow those details from another PowerShell
window while a release is running:

```powershell
Get-Content -LiteralPath '<printed-log-path>' -Wait
```

To open the most recent complete release log later:

```powershell
$latestReleaseLog = Get-ChildItem .\deployment-logs\production-release-*.log |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
Get-Content -LiteralPath $latestReleaseLog.FullName
```

The frontend is first deployed to a one-day Firebase preview channel named for
the release. A read-only browser smoke runs against that preview and the newly
promoted canonical backend. Only the exact tested preview version is then
cloned to the live channel; the prior live version is retained in the fixed
`production-rollback` channel.

The first apply is also the smoke bootstrap: the zero-traffic backend candidate
already contains `/ready` and both job binaries, so the script checks readiness,
creates the jobs from that exact immutable image, and only then promotes the
backend. The script performs no schema migration or cutover SQL.
