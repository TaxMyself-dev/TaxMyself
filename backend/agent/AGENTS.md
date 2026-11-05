# backend/agent — the AI agent's backend (KT-089)

## Purpose

The KeepInTax AI agent's backend, ported 1:1 from the team's agent template: its chat runtime, tool loop and harness, memory, skills, tracking tasks and background monitor, evals and harnessing. A separate strict ESM package (Effect 4, AI SDK 7, TypeScript 6/7, vitest, deepeval), because the Nest backend is CommonJS on TypeScript 5. Read [GUIDE.md](GUIDE.md) first; the template's own guide is [TEMPLATE-GUIDE.md](TEMPLATE-GUIDE.md).

## Key entities

- The template's tables in MySQL: `agent_users` ((actor, data owner) Firebase uids → agent id), `user_settings`, `agent_chat_*` (conversations, messages, documents, stream chunks, steers), `agent_memories`, `agent_usage`, and the example tracking tasks (`tracking_tasks`, `task_*`, `user_notifications`). Schema: `backend/scripts/migrations/2026-10-22_agent_harness_schema.sql`, then `2026-11-05_agent_actor_owner_scope.sql`.
- `backend/shared/mysql/`: the gateway that answers supabase-js's PostgREST requests from MySQL, with the template's row level security and grants as code and its Postgres functions as transactions.

## Main flows

- The Nest module `backend/src/agent-harness` verifies the Firebase token and calls `handleAgentHttpRequest` (`src/server/agent-http.server.ts`) with the verified user; routes and server functions are the template's.
- The task worker (`npm run worker:tasks`, `dist/task-worker.mjs`) runs beside the backend, never inside a request.

## Invariants

- Template files stay the template's: change them only to port a template change, or where GUIDE.md lists a KeepInTax change. Domain parts are `EXAMPLE` until the agent spec replaces them.
- Every user query goes through the gateway's user scope; only the task monitor uses the service client.
- The agent's data belongs to the pair (actor `actorFirebaseId`, data owner `firebaseId`), and each conversation to the verified business it started in (GUIDE.md "Isolation"). A conversation id never authorizes anything by itself. Domain tools keep the backend's own authorization (EXPENSES_APPROVE for accounting decisions) and re-check the delegation on each call.
- Development traces go only to a local Langfuse (`langfuse-tracing.server.ts`).
- Schema changes: a new SQL script under `backend/scripts/migrations/` and the gateway's table registry (`mysql-agent-tables.ts`); never `synchronize`.
- Checks: `npm run typecheck`, `npm run check`, `npm test` (with `AGENT_TEST_DATABASE_URL` for the MySQL integration tests), `npm run build`.

## Related topics

- [agent-harness](../src/agent-harness/AGENTS.md) — the Nest edge.
- [guards](../src/guards/AGENTS.md) — FirebaseAuthGuard and delegation.
