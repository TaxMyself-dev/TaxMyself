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
Both `.gcloudignore` and `.dockerignore` explicitly exclude legacy tracked
Firebase service-account JSON and private-key files, as Git tracking alone
does not make a source file safe for upload. Runtime Firebase uses the dev
service's existing environment credentials, never the legacy source JSON.
The dev image pins npm 11.6.2 to match the verified worktree; clean npm installs
use the completed agent lockfile, including nested optional WASI dependencies.
Use Debian bookworm, not Alpine: Effect's packaged Oxlint integration used by
the agent prepare script explicitly does not support Linux musl. The agent
stage runs before the Nest stage to fail early on agent-toolchain problems.
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
session is available, report that gap explicitly. Never guess existing-user
credentials or mark authenticated smoke as passed without execution. An API
smoke may create its own temporary dev Firebase identity, exchange a custom
token, and exercise its own agent session/chat. Always remove only that test
identity and its actor/owner-scoped agent rows afterwards; do not create an
app business or send email for this smoke.

Record the source commit, immutable image digest, deployed revision, checks and
remaining manual checks. No main integration or GitHub push is required.

## Executed release — 2026-11-11

- Branch/worktree: `new-ai-assistant`, `TaxMyself-new-ai-assistant`.
- Executable source: `e1b2cff3` (base feature revision `ec8b65f1`). Later
  documentation-only commits are not rebuilt into the image.
- Cloud Build: `5f8e1d35-7e15-4a8a-99a2-bc8b5b2a2b82`, SUCCESS.
- Image: `me-west1-docker.pkg.dev/taxmyself-prod/cloud-run-source-deploy/taxmys16elf-dev@sha256:65a343d509f50918ad904821f5c60af2fbe19f25316bee49bb98734c6e4473d8`.
- Backend revision: `taxmys16elf-dev-ai-e1b2cff3`, Ready=True, 100% of dev
  traffic, min instances 1, CPU throttling false. DB remains `keepintax-dev`,
  Firebase remains `taxmyself-5d8a0`, synchronize disabled.
- Compared to the prior dev configuration, only four env names changed:
  `AGENT_APP_ORIGINS`, `DISABLE_SYNCHRONIZE`, `OPENAI_API_KEY`,
  `TYPESAFE_API_KEY`. No secret values are recorded here.
- Dev frontend: preview `ai-cf59a367` cloned to dev live; its frontend source
  is unchanged by the subsequent backend packaging commits. Deployed entry
  asset `main.af08d01c0d3abc08.js` verified to contain dev API/Firebase and
  enabled agent page, with the production API URL absent.
- Previous dev frontend retained in `rollback-ai-e1b2cff3` for one day.

Executed checks and limits:

- Agent: `npm run typecheck`, `npm run check`, `npm test`, `npm run build`:
  exit 0; 303 passed, 22 skipped across three MySQL integration files because
  no isolated AGENT_TEST_DATABASE_URL was supplied. Compiler suggestions
  were non-failing. These ran before packaging-only corrections; no agent
  implementation changed afterwards. The final Linux image rebuilt with
  clean installs, completed lockfile and pinned npm 11.6.2.
- Nest: `npm test -- --runInBand agent-harness report-review-read-only`:
  5 suites / 83 tests passed; `npm run build`: exit 0. Final Linux image also
  rebuilt Nest successfully after removing the unused invalid `-` dependency.
- Frontend: `npm test -- --watch=false --browsers=ChromeHeadless
  --ts-config=tsconfig.admin-ai-chat.spec.json
  --include=src/app/pages/admin-panel/admin-panel.page.spec.ts
  --include=src/app/pages/dev-agent/dev-agent.route.spec.ts`: 13 passed.
  The first attempt omitted the include flags and failed compilation; the
  corrected command executed all 13. No snapshots were updated.
- `npm run build:dev`: exit 0. Separate production-config verification build
  to an ignored output directory: exit 0. Existing bundle/style budget and
  CommonJS warnings remain; neither production resources nor hosting were used.
- Read-only final-branch schema comparison: 59 entity tables, no missing
  tables/columns/enum values. The 16 agent tables and actor/owner indexes were
  checked separately. No schema changes were made during this deployment.
- Linux image imported the agent's exports with networking disabled. Node
  v24.22.2, Chromium present, synchronize disabled, legacy credential absent.
- Candidate HTTP: `/` and `/auth/get-cities` 200; unauthenticated agent 401.
  Temporary dev Firebase identity: authenticated session 200, chat POST from
  invalid origin 403, live model SSE contained text with no error event, saved
  conversation read 200. The generated Firebase identity and its single agent
  user row were deleted; FK cascades removed its chat/settings rows.
- The first origin smoke incorrectly tested a read-only server function;
  the corrected chat-POST check passed. The first smoke identity was cleaned
  too. These were smoke-script corrections, not application changes.
- After promotion: canonical frontend-configured backend `/` and cities 200,
  unauthenticated agent 401; public frontend asset/target checks passed.
- Browser: preview and dev live loaded the login page and correctly gated
  `/dev/agent`. No existing signed-in user was available, so authenticated
  browser interaction, stop/resume and real-business reads remain manual.
- PowerShell HTTP probes timed out in this machine's network environment;
  Node fetch probes passed. The redundant hung PowerShell probe was stopped.

Packaging findings: clean installs exposed the invalid root dependency,
incomplete optional dependency lock entries, and Alpine's unsupported musl
toolchain. All were addressed in the dev image/branch. A pre-existing tracked
production Firebase credential was discovered in source: it was never used;
it is now excluded by upload and Docker ignore rules. Three earlier source
objects created by this task were removed from Cloud Storage. Automatic
approval review blocked deletion of local ignored snapshot/archive copies;
those copies remain under the ignored deployment-logs directory. The original
tracked credential was not changed; credential retirement is separate work.

No main integration, GitHub push, production-service change, or separate
example task-worker activation was performed.
