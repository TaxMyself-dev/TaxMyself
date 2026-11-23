# Local AI startup and background-error isolation

- Status: WORKER_COMPLETE (verified locally; no main integration or push)
- Date: 2026-11-14
- Worktree: C:/Users/user/Keepintax/TaxMyself-new-ai-assistant
- Branch: new-ai-assistant
- Base: 69e70df9

## Acceptance

- One local command starts the required Docker/Langfuse, agent/Nest and
  frontend development services and checks readiness; existing services and
  .env files are preserved. No schema or production access.
- Optional exporter failure and late agent SDK rejection, including the
  reported AggregateError/node:net shape, do not stop the backend.
- Unrelated backend failures are not silently swallowed. Save failures
  remain errors, with background failures observed immediately.
- Focused regression tests, types, lint, builds, documentation and local
  diff review; no main integration, push, deployment or paid model evals.

## Verification

- Backend: scoped ESLint exit 0; Jest agent-background-context,
  agent-harness.controller, agent-harness.access: 3 suites, 20/20
  tests passed; Nest build exit 0. Child processes verify that an agent
  AggregateError with only node:net frames survives, while an unrelated
  backend rejection remains fatal, even when the guard is installed in
  agent context.
- Agent: typecheck exit 0 (pre-existing informational Effect suggestions),
  Ultracite check exit 0; 2 focused files, 8/8 tests; build exit 0.
  Tests include actual Langfuse flush/shutdown boundaries with rejected
  SDK promises, an optional exporter defect, and a failing error reporter.
- Launcher: 4/4 Node tests; help exits 0; successful infrastructure-only
  startup from stopped Docker/Langfuse; final --no-build and --check exit 0.
  Cold frontend compilation succeeded. Initial readiness incorrectly used
  non-HTML requests (404) and a short timeout; HTML Accept, a regression
  test, ten-minute frontend readiness and per-port PID records correct it.
  The one duplicate CLI created during diagnosis was identity-checked and
  stopped; the original frontend was preserved. Repeated final runs reused
  all healthy services.
- The prior feature backend was started before the fix. Its exact process
  identity and port were verified before a controlled local restart through
  the launcher. The new backend compiled with 0 errors, logged
  DB_DATABASE=keepintax-dev/synchronize=false, and served the authenticated
  agent route with expected 401 without a token. The frontend and Langfuse
  health returned HTTP 200. Docker, Langfuse, backend 3000 and frontend 4200
  are running for the user. No other worktree process was stopped.
- No broad suite, production check, authenticated real-model request, or
  paid eval was run for this non-model-behavior change.

## Delivery

- Existing environment files, independent dependencies and the three
  pre-existing untracked files were preserved outside the commit.
- Local runtime logs/PID records are ignored under .local-ai-dev/.
- No schema/migration, accounting, tax, business authorization or external
  API contract changed. No cloud command, main integration, push or
  deployment was performed. Unrelated backend programming failures are
  deliberately not hidden by a global catch-all.
- Usage and prerequisites: [local AI development](../../operations/local-ai-development.md).

## User-requested launcher scope correction (2026-11-14)

- Supersedes the application-startup instructions and historical launcher
  behavior above: start-ai.cmd now starts only Docker Desktop and the existing
  Langfuse stack. The user starts frontend/backend manually. Application build,
  process management, readiness probes and backend environment reads were removed.
- --check now checks only Docker/Langfuse; --infrastructure-only remains an alias.
  Application startup flags are rejected. Existing running apps were not stopped.
- Verification: node --test scripts/start-ai-dev.test.cjs: 3/3 passed;
  node scripts/start-ai-dev.cjs --help: exit 0;
  node scripts/start-ai-dev.cjs: exit 0, existing compose stack healthy;
  node scripts/start-ai-dev.cjs --check: exit 0, Docker and Langfuse READY.
- No backend/agent behavior changed; their previous passing checks were not rerun.
  No main integration, push or deployment.
