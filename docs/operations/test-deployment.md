# Shared test deployment

Run from the checkout you want to test (a clean feature branch is supported):

```powershell
.\scripts\deploy-test -Plan
.\scripts\deploy-test
.\scripts\deploy-test backend
.\scripts\deploy-test frontend
.\scripts\deploy-test -SkipLocalTests
.\scripts\deploy-test -Help
```

Requires PowerShell 7, Git, Node/npm, and the relevant globally installed CLIs.
Authenticate beforehand with `gcloud auth login` for backend and `firebase login`
for frontend. Missing authentication/access fails before dependency installs.
The existing backend service must already exist; the script preserves its cloud
runtime environment/secrets and does not upload the checkout's `.env` files.

The backend target is **taxmys16elf-dev**, region **me-west1**, in Google Cloud
project **taxmyself-prod**. The project name is shared with production, but the
service name is fixed to DEV and cannot be overridden. Backend code is archived
from the verified commit, excluding local dependencies, build output and env
files from upload. No schema commands or production smoke jobs are invoked.

The frontend target is **hosting:app** in Firebase project **taxmyself-5d8a0**.
The build runs `npm run build:dev` (DEV API/Firebase, optimized PWA). The landing
site and production Hosting are not deployed. The resulting application is at
<https://taxmyself-5d8a0.web.app>.

Every selected package runs its own `npm ci` and build. Backend Jest runs unless
`-SkipLocalTests` is supplied. All local builds complete before cloud deployment
starts. `-Plan` and `-Help` do not invoke CLIs or create files. The real deployment
requires a clean checkout and checks it again before each cloud write.

This replaces the shared test environment, so coordinate with other testers.
Failures stop immediately and report the stage. There is no automatic rollback;
a backend success followed by a frontend failure leaves the new backend active.
No automated browser/signup smoke is claimed: manually verify the test app after
deployment. Production deployment continues to use `scripts/deploy` unchanged.
