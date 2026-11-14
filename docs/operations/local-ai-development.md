# Local AI infrastructure on Windows

Run from the existing feature worktree:

```powershell
.\start-ai.cmd
```

This starts only local Docker Desktop and the existing Langfuse compose stack,
then waits for container and HTTP health on http://localhost:3100.
Start the frontend and backend yourself. This launcher never starts, builds,
checks, restarts or stops either application, and never reads backend/.env.
Existing application processes are left running.

- `--check`: read-only Docker and Langfuse availability; exit 1 if unavailable.
- `--help`: side-effect-free usage.
- `--infrastructure-only`: compatible alias for the default behavior.

Prerequisites: Node, Docker Desktop, existing docker-compose.yml and .env at
`%USERPROFILE%\langfuse-local`. `LANGFUSE_DIR` may select another existing
local compose directory. Remote Docker endpoints are refused. No credentials
are generated, environment files edited, application dependencies installed,
SQL executed, or deployment performed.

Langfuse is optional for chat availability. Its exporter failures are contained
and logged; unrelated backend programming failures remain fatal.
