# AI assistant dev-cloud deployment

This is a branch-based dev deployment, separate from `scripts/deploy.ps1` and
its production-only main/release gates. Never use those production wrappers
for this environment.

## Exact targets

- Backend: Cloud Run `taxmys16elf-dev`, project `taxmyself-prod`, region
  `me-west1`. The project is shared; the production service is never a target.
- Database: `keepintax-dev`, with `DISABLE_SYNCHRONIZE=true`.
- Frontend: Firebase project/site `taxmyself-5d8a0`, hosting target `app` only.

## Build and configuration

Build a tracked Git snapshot using `backend/Dockerfile.agent-dev` with the
backend directory as context. Node 24 builds Nest and the separate ESM agent
package; the runtime includes `agent/dist`, its package manifest and production
dependencies. Do not upload `.env`, local timings, eval outputs or node_modules.
The production Dockerfile is independent and unchanged.
The dev image pins npm 11.6.2 to match the verified worktree; clean npm installs
use the completed agent lockfile, including nested optional WASI dependencies.
The unused invalid dependency named `-` was removed from the backend manifest
and lockfile: clean installs under the Node 24 image's npm reject that name.

The dev service preserves its existing environment, with the following updates:

- `DISABLE_SYNCHRONIZE=true`.
- `OPENAI_API_KEY` and `TYPESAFE_API_KEY`, copied privately from the authorized
  worktree's ignored `backend/.env`; never print or commit their values.
- `AGENT_APP_ORIGINS=https://taxmyself-5d8a0.web.app,https://taxmyself-5d8a0.firebaseapp.com`.
- Reuse the dev DB settings; leave AGENT_DB_* unset so the gateway follows them.
- Keep at least one instance and disable CPU throttling for asynchronous agent
  work after HTTP responses. This creates ongoing dev compute cost.
- Do not start the separate example task-monitor worker for chat testing.
- Langfuse remains optional; local tracing configuration is not copied to cloud.

Build the frontend with `npm run build:dev`, never the default production build.
`environment.dev.ts` explicitly enables `agentDevPage`; the production
environment does not. `/dev/agent` retains Firebase AuthGuard and backend
actor/owner authorization.

## Verification and rollout

Run agent typecheck, check, unit tests and build; focused Nest agent-harness
and report-review-read-only tests and build; focused admin/agent frontend
tests with matching `--include` arguments and build:dev. MySQL integration
tests require an isolated AGENT_TEST_DATABASE_URL, never the shared dev DB.

Import the agent from the Linux image before deployment. Deploy the backend
candidate with zero traffic and an explicit revision/tag, preserve existing
dev env values, and check startup, GET /auth/get-cities, unauthenticated agent
rejection and the configured DB/synchronize target. `/ready` is production-only
and intentionally rejects keepintax-dev; do not weaken it for this rollout.
Promote the exact verified dev revision, then deploy only dev hosting:app.

Authenticated browser verification covers the dev agent route, session/chat,
streaming, saved history, stop/resume and books reads. If no authorized browser
session is available, report that gap explicitly. Never invent user credentials
or mark authenticated smoke as passed without execution.

Record the source commit, immutable image digest, deployed revision, checks and
remaining manual checks. No main integration or GitHub push is required.
