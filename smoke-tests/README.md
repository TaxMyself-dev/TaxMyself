# Production smoke tests

These tests run outside the application and exercise an explicitly selected
deployed environment through its public URLs. They never infer a URL from the
repository, which prevents an accidental production run.

Install the pinned Playwright dependency once from this directory:

```powershell
cd smoke-tests
npm ci
cd ..
```

The browser itself must also be available. By default the suite uses installed
Chrome; set `SMOKE_BROWSER_CHANNEL=msedge` to use installed Microsoft Edge.

## Candidate backend readiness

Before sending traffic to a new backend revision, point only the API URL at
that exact tagged revision:

```powershell
$env:SMOKE_API_URL = 'https://<candidate-revision-url>'
npm run smoke:readiness
```

This calls `/ready` on the candidate itself and verifies its connection to the
production database and signup-critical schema. It does not require or open the
frontend.

The equivalent guarded wrapper from the repository root is:

```powershell
./smoke-tests/run-candidate-readiness.ps1 -ApiUrl 'https://<candidate-revision-url>'
```

## Deployed frontend read-only smoke test

Set both targets explicitly, then run the suite:

```powershell
$env:SMOKE_WEB_URL = 'https://app.keepintax.co.il'
$env:SMOKE_API_URL = 'https://taxmys16elf-prod-tau7bgxb3q-zf.a.run.app'
npm run smoke:readonly
```

The test performs no application writes. It opens `/register`, confirms that
the page calls `/auth/get-cities` on the expected backend origin, and fails on
page errors, console errors, or 5xx responses from the web/API origins. Failure
traces, screenshots, videos, and an HTML report are stored under `artifacts/`.

Use `SMOKE_BROWSER_CHANNEL=msedge` when Chrome is unavailable. Plain HTTP is
rejected unless `SMOKE_ALLOW_HTTP_LOCALHOST=true` and the URL host is local.

This command is intentionally read-only. The separately gated command below
performs the synthetic signup, email verification, login, and cleanup flow.

## Synthetic signup and login with guaranteed cleanup

`npm run smoke:signup` uses the single guarded address
`smoke-test@keepintax.co.il`, generates a fresh alphabetic run id for the user
and Drive-folder names, and then runs this sequence:

1. Readiness and registration-page checks.
2. Signup through the deployed public UI and `POST /auth/signup`.
3. Email verification through a private, Firebase-only Cloud Run job.
4. Login through the deployed UI and navigation to `/my-account`.
5. Privileged cleanup through a second private Cloud Run job, even when an
   earlier step fails.

Both Cloud Run jobs must already exist and must have no public HTTP surface.
Configure them from the same backend image:

- Verification job: command `node`, argument
  `dist/smoke/verify-smoke-user.js`. It needs Firebase Admin access only.
- Cleanup job: command `node`, argument
  `dist/smoke/cleanup-smoke-user.js`. It needs DB, Firebase Admin, and Drive
  access.

Configure credentials from Secret Manager. The cleanup binary itself requires
the connected database name to be exactly `keepintax-prod`; callers cannot
override it. Do not store credentials in this package or pass them as execution
overrides.

Before configuring the jobs, an authorized production operator can run this
read-only inventory from the repository root:

```powershell
./smoke-tests/inspect-cloud-run-source.ps1
```

It prints the deployed image, runtime service account, network-presence flags,
and whether each required variable is missing, plain, or a Secret Manager
reference. It never prints environment values or secret names.
`readyToConfigureJobs` is false only when required configuration is missing.
`securityWarnings` separately lists sensitive variables that should move to
Secret Manager in the security-hardening follow-up; it does not block the
initial smoke-job setup.

After a backend image containing the smoke entrypoints has been deployed, an
authorized operator can preview the two job definitions without changing GCP:

```powershell
./smoke-tests/configure-cloud-run-jobs.ps1
```

The preview uses job names `keepintax-smoke-verify` and
`keepintax-smoke-cleanup`. Applying the plan is deliberately double-gated:

```powershell
$env:SMOKE_CONFIGURE_JOBS = 'taxmyself-prod'
./smoke-tests/configure-cloud-run-jobs.ps1 -Apply
```

The script copies only the required backend configuration. Existing Secret
Manager references remain references. Plain values are Base64-encoded before
they cross the command boundary and decoded only inside the job. Base64 is not
encryption: those variables remain part of the separate Secret Manager
hardening task. The script never prints their original or encoded values and
does not execute either job.

The caller needs Cloud Run permission to execute the job with per-execution
environment overrides. Set:

```powershell
$env:SMOKE_WEB_URL = 'https://app.keepintax.co.il'
$env:SMOKE_API_URL = 'https://taxmys16elf-prod-tau7bgxb3q-zf.a.run.app'
$env:SMOKE_VERIFY_JOB = '<Firebase verification Cloud Run job name>'
$env:SMOKE_CLEANUP_JOB = '<Cloud Run job name>'
$env:SMOKE_GCP_PROJECT = 'taxmyself-prod'
$env:SMOKE_GCP_REGION = 'me-west1'
npm run smoke:signup
```

For the standard production names and URLs, use the write-capable wrapper from
the repository root. Its explicit gate prevents an accidental run:

```powershell
$env:SMOKE_RUN_PRODUCTION = 'app.keepintax.co.il'
./smoke-tests/run-production-smoke.ps1
```

The runner passes only the generated run id and one-shot enable flag to each
job. The fixed email is compiled into both jobs and cannot be replaced by an
execution override. Cleanup resolves the UID independently from Firebase and
MySQL and aborts if they disagree. It deletes only a Drive folder whose exact
guarded name exists under the configured system root, then deletes Firebase
and the signup DB rows. Foreign keys remain enabled so unexpected data blocks
deletion. The verification job changes only that fixed Firebase user's
`emailVerified` flag; it does not bypass the application's login flow.

Run this command serially. If a prior cleanup failed, the next signup will fail
on the existing fixed email and must not silently delete an identity whose
run-derived name does not match.

For the release order and rollback rule, see
`docs/operations/production-smoke.md`.
