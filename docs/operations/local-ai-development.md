# Local AI development on Windows

Run from the existing feature worktree, using its own dependencies/environment:

```powershell
.\start-ai.cmd
```

The command ensures local Docker Desktop is running, starts the existing
Langfuse compose stack and waits for its services and HTTP health, builds
the agent and Nest, starts Nest watch and Angular, and prints the chat URL.
Processes run with hidden windows; stdout/stderr stay in ignored
`.local-ai-dev/backend.log` and `frontend.log`. Logs can contain application
data: do not commit or share them without review.

Defaults: backend 3000, frontend 4200, Langfuse 3100. The chat URL includes
the selected backend's `?api=` override. Existing responsive services are
reused, never stopped. If an existing backend predates a code fix, stop it
in its original terminal once and rerun this command to load the new code.

```powershell
.\start-ai.cmd --check
.\start-ai.cmd --infrastructure-only
.\start-ai.cmd --backend-port 3011 --frontend-port 4211
```

- `--check`: read-only availability report, exit 1 when any required service
  is down. Does not start Docker, containers, builds, or application processes.
- `--infrastructure-only`: start Docker and Langfuse without application or
  business-database access.
- `--no-build`: use an existing agent bundle; normally keep automatic builds.
- `--help`: side-effect-free usage.

Prerequisites: project Node 24/npm, Docker Desktop, independent npm installs
in backend, backend/agent and frontend, and the existing backend/.env and
Langfuse configuration at `%USERPROFILE%\langfuse-local`. `LANGFUSE_DIR`
may select another existing local compose directory. Nothing is installed,
no keys are generated, and .env files are never edited. Agent database tables
must already be installed by the authorized setup; this command runs no SQL.

Only the existing `keepintax-dev` database is accepted. The backend child
uses development mode with `DISABLE_SYNCHRONIZE=true` and
`SKIP_BOOT_SEED=true`. Non-local Docker endpoints are refused. No cloud
commands, deployment, production access, or example task workers are started.

Langfuse is optional for chat availability. Its failure is reported with a
rate-limited exporter warning; it must not stop Nest. Async agent background
work is attributed by its origin, rather than relying only on error stacks.
Other backend programming failures remain fatal instead of being hidden.

Cold Angular compilation may take several minutes: readiness waits up to
10 minutes. PID records per service/port reuse a still-starting process
from this launcher on retry; no existing process is killed.
