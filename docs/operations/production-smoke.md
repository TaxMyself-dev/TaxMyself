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
   `/ready` fails: the revision cannot reach the real production DB or its
   signup-critical schema is incomplete.
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

`scripts/Deploy-Production.ps1` coordinates the complete flow. Its default is
read-only plan mode:

```powershell
./scripts/Deploy-Production.ps1 -Plan
```

The script never receives, stores, or bypasses an account password. The first
`-Apply` stage explicitly launches both interactive login flows:

```powershell
gcloud auth login
firebase login --reauth
```

Only after both logins succeed does the preflight stage perform read-only checks
that the active sessions can access `taxmyself-prod`. An unauthorized session
stops the release before any build or deployment. `-Plan` does not launch login
windows; it validates the sessions that already exist. Git authentication is
checked naturally by the required `git fetch origin`; Git Credential Manager
may prompt if its own session has expired.

An authorized production operator applies the displayed plan with both gates:

```powershell
$env:KEEPINTAX_PRODUCTION_DEPLOY = 'taxmyself-prod'
./scripts/Deploy-Production.ps1 -Apply
```

`KEEPINTAX_PRODUCTION_DEPLOY` is checked before opening the login flows. It is
an anti-accident confirmation, not a password or credential; possessing it
grants no Google Cloud or Firebase permissions.

Release identifiers use local date/time plus a monotonically increasing
sequence, for example `r20261026-191522-0042`. The sequence is derived from
prior revisions created by this script. Each stage prints `START` and `COMPLETE`;
failure output includes `FAILED`, the exact stage, and the exception reason.

The terminal intentionally stays quiet during each stage. It prints the local
log path once, followed by stage status, concise failure/rollback status, and
the final outcome. Full npm, test, build, gcloud, Firebase and smoke output is
streamed in real time to a timestamped file under the git-ignored
`deployment-logs/` directory. To follow those details from another PowerShell
window while a release is running:

```powershell
Get-Content -LiteralPath '<printed-log-path>' -Wait
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
