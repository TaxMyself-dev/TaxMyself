# Shared test deployment

The dedicated `test` branch is the source of truth for the shared test environment.
Run from a clean checkout of `test`, after its commit has been published to `origin/test`:

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
requires a clean `test` branch and fetches `origin/test` before checking exact
commit equality. Local ahead, behind or diverged branches are all rejected.
The branch, cleanliness, original commit and freshly fetched remote commit are
checked again before each cloud write. Missing origin/test or fetch failure blocks
deployment. No automatic merge, reset, pull or push is performed.

Changes reach test by reviewed integration into `test`, followed by an authorized
push and then deployment. Creating `origin/test` for the first time also requires
an authorized push; the local branch alone cannot pass the deployment gate.
Every merge/integration into `test` requires Elazar's explicit approval.
Every push of `test` to GitHub also requires his explicit approval. Neither
approval may be inferred from a general development request or passing tests.
For pushes to `test`, personal testing of local main is not required. This is
an explicit exception only for test; main integration and main push retain
their separate approval gates, including personal main testing before push.

This replaces the shared test environment, so coordinate with other testers.
Failures stop immediately and report the stage. There is no automatic rollback;
a backend success followed by a frontend failure leaves the new backend active.
No automated browser/signup smoke is claimed: manually verify the test app after
deployment. Production deployment continues to use `scripts/deploy` unchanged.
