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

## Local application ports and main integration

Main's local development configuration must use frontend 4200, backend 3000
and frontend API http://localhost:3000/. Before integrating a feature into main,
verify effective serve/start options, the local backend PORT and process or
environment overrides; record the result. The binding gate is in
[the root instructions](../../AGENTS.md#required-local-port-check-before-main-integration).
Feature worktrees may use other ports through ignored local overrides. Keep
those overrides out of the integration diff. Deployment PORT/API configuration
is separate. Port verification does not replace explicit integration/push approval.

### Normal application startup with worktree overrides

Use npm start in frontend and npm run start:watch in backend. Both now read
.local-ai-dev/ports.json when it exists; it contains integer frontendPort and
backendPort values. The frontend uses an ignored generated environment file,
and backend watch overrides a stale shell PORT and permits the configured local
frontend origin for chat. With no local port file, normal main startup defaults
and the tracked API URL are preserved. Do not commit the port file or backend/.env.

Inspect effective settings before starting or integrating:

    npm start -- --print-config
    npm run start:watch -- --print-config

Run each command from its corresponding package directory. This diagnostic does
not bind a port. Stop an existing server using the selected ports before starting
another copy. Local overrides are per checkout; main's pre-integration gate still
requires frontend 4200, backend 3000 and API http://localhost:3000/.
