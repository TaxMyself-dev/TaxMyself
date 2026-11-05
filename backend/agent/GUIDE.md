# KeepInTax agent: guide

This package is the KeepInTax AI agent's backend, ported 1:1 from the team's agent template (`agent-template-2026-10-22`; its own guide is kept verbatim in [TEMPLATE-GUIDE.md](TEMPLATE-GUIDE.md)). The harness is the template's, file for file: the agent and its tool loop, the tool runtime (traits, approvals and action rules, error next steps, the exclusive runner, null repair, output cuts, tool search and namespace rules), the turn (stop hooks, plan gate, turn gates, answer check, turn signals, follow-ups), the model (prompt cache, privacy, adaptive reasoning, visible retries, telemetry, usage), memory (long-term, short-term folding, earlier results), skills, attached documents, the chat runtime (answer lease, resumable streams, stop, steer, titles), the tracking tasks and their background monitor, and the tests, evals, harnessing and trace mining.

What is not here yet: the chat UI (its spec is pending; the template's React UI is in the template; a dev-only Angular test page is at `/dev/agent`) and most of KeepInTax's own agent (prompts, domain tools, playbooks, eval cases: the agent spec is pending). Until then the template's domain parts stay marked `EXAMPLE`, as the template ships them.

## What exists today

| Layer | State |
| --- | --- |
| **Ported from the template** (infrastructure) | The whole harness and chat runtime listed above, the MySQL gateway standing in for Supabase, the eval runner, harnessing and trace mining. Unit and MySQL integration tests pass (see "Checks"). |
| **KeepInTax isolation** | The agent's user is the pair (actor, data owner); each conversation belongs to the business it started in; revoked access stops even an answer already running (see "Isolation"). |
| **Working business capability** | One read tool, `queryExpenses`, through the Nest `ExpensesService` (see "queryExpenses"). Verified against `keepintax-dev` data; the real-model chat and the five evals wait for an `OPENAI_API_KEY`. |
| **Not built** | Every other tool of `docs/plans/ai-agent-tools-plan.md`, the product chat UI, the background jobs, the business profile. The template's example tools (`searchWeb`, `sendEmail`, tracking tasks) are still wired with no real sources. |

**For a coding agent:** treat every file under `src/agent`, `src/lib`, `src/server` (except the files named under "What KeepInTax changed"), `backend/monitor`, `backend/shared` (except `mysql/` and `supabase/`) and `tests` as the template's reviewed code. Read the comment at the top of each file before changing it. When the template changes, port its change file for file.

## Quick start

1. In `backend/agent`: `npm install` (Node 24; it also runs the DeepEval patch and compiles the messages).
2. Apply, in order, `backend/scripts/migrations/2026-10-22_agent_harness_schema.sql` (new tables) and `2026-11-05_agent_actor_owner_scope.sql` (the (actor, data owner) and business scope) to the database the backend uses, development first. Both are applied on `keepintax-dev` (2026-11-05). Never apply them to production without the team's go-ahead.
3. Put the agent's keys in `backend/.env` beside the backend's own (see `.env.example`): `OPENAI_API_KEY`, `TYPESAFE_API_KEY`, `AGENT_APP_ORIGINS`, and the Langfuse keys with `LANGFUSE_BASE_URL=http://localhost:3000` (see "Langfuse": in development a cloud URL turns tracing off).
4. `npm run build`: the bundle the Nest backend loads (`dist/agent-http.mjs`) and the worker (`dist/task-worker.mjs`).
5. Start the backend as usual; the agent answers under `/api/agent/*`. Run the task worker beside it: `npm run worker:tasks` (or `node dist/task-worker.mjs`).
6. Check it: `npm run typecheck`, `npm run check` (lint and format), `npm test` (unit tests; the MySQL integration tests run only with `AGENT_TEST_DATABASE_URL`, see "Checks"). `npm run eval -- --variant <name> --reps 3` calls the real model and costs money (npm needs the `--` before the runner's flags; the same for `npm run harness -- ...`). The real-chat scripts run as `npx tsx --env-file-if-exists=../.env --env-file-if-exists=.env.local tests/evals/traces/<script>.ts`.

## How a request reaches the agent

```
Angular app ──Bearer token──▶ Nest: AgentHarnessController (/api/agent/*)
                                │  FirebaseAuthGuard verifies the token
                                │  (actor, data owner, business, delegation)
                                ▼
                     handleAgentHttpRequest (src/server/agent-http.server.ts)
                                │  the template's routes and server functions
                                ▼
          the template's code (src/agent, src/lib, src/server) — unchanged
                                │  supabase-js queries
                                ▼
          MySQL gateway (backend/shared/mysql): PostgREST answered from MySQL,
          row level security in code, the template's Postgres functions
                                ▼
                        KeepInTax MySQL (agent_* tables)
```

| Route | What it is (template) |
| --- | --- |
| `POST /api/agent/chat` | the chat (`respondToAgentChat`) |
| `GET /api/agent/chats/:id/stream` | follow a running answer (resume) |
| `POST /api/agent/chats/:id/stop` | stop it |
| `POST`, `DELETE /api/agent/chats/:id/steer` | send a message into it, withdraw one |
| `GET /api/agent/chats/:id/follow-ups?message=` | an answer's follow-up questions |
| `GET /api/agent/fn/:name?data=<json>` | a server function that reads (the template's `createServerFn` GETs) |
| `POST /api/agent/fn/:name` (JSON body) | one that changes |

The server functions are the template's own (`*-persistence.ts`): the session (`readAgentSession`, new: the user's agent id), chats (list, read, search, rename/pin, delete, title), memory, settings, notifications, tracking tasks, scan runs, opportunities, page state and the dictation key.

## What KeepInTax changed, and why

| Template | KeepInTax | Where |
| --- | --- | --- |
| Bun | npm (the repository's rule); scripts run with `tsx` and Node 24 | `package.json` |
| TanStack Start on Nitro: routes, server functions, request hooks | The Nest backend serves `/api/agent/*` and calls `handleAgentHttpRequest`; `createServerFn` is a small builder with the same API; metrics and telemetry flush after each response as the Nitro hook did | `src/server/agent-http.server.ts`, `src/server/runtime/server-function.ts`, `app-runtime.server.ts`, `backend/src/agent-harness` |
| Supabase auth (cookies, `auth.getClaims()`) | Firebase, verified by the Nest backend's `FirebaseAuthGuard`; the agent maps each Firebase uid to its own user id (`agent_users`), so every id the template treats as a uuid stays one | `src/server/runtime/supabase-client.ts`, `agent-request-identity.ts`, `agent-request-context.ts`, `backend/shared/mysql/mysql-agent-clients.ts` |
| Supabase Postgres with row level security and SQL functions | KeepInTax's MySQL 8, through a gateway that answers supabase-js's PostgREST requests: the template's queries and typed tables are unchanged; the policies and grants become code (every user query scoped to the user's rows, new rows written as theirs, conversations checked, upserts never take over another user's row, column grants); the Postgres functions become MySQL transactions with the same locks (`FOR UPDATE SKIP LOCKED`, fencing) | `backend/shared/mysql/*`, `backend/shared/supabase/supabase-service-database.ts`, `backend/scripts/migrations/2026-10-22_agent_harness_schema.sql` |
| Same-origin pages | The Angular app calls the API from another origin: `AGENT_APP_ORIGINS` lists the app's origins for the cross-site guard | `src/server/runtime/app-same-origin-request.ts` |
| paraglide URL strategy (`/he`) | `baseLocale`: server routes carried no `/he` in the template either, so server text was English there too; the chat's language comes with each chat request | `package.json` (`generate-i18n`) |
| `bun patch` of deepeval | the same patch (delete the stale `dist/telemetry.js`) after `npm install` | `scripts/patch-deepeval.ts` |
| Vite bundling | esbuild bundles the server entry and the worker | `scripts/build-agent.ts` |
| macOS paths in the eval scripts (`/usr/bin/git`, `.bin/vitest`, `~/.local/bin/claude`) | the same on macOS and Linux, and Windows' equivalents | `tests/evals/runner`, `tests/evals/harnessing` |
| Example domain ports only | KeepInTax's ports (`keepintax-ports.ts`): the Nest backend passes `handleAgentHttpRequest` a domain bound to the verified user (`backend/src/agent-harness/agent-domain.service.ts`), carried in the request context; the first tool is `queryExpenses` | `src/agent/core/ports/keepintax-ports.ts`, `src/server/agent-ports.server.ts`, `src/agent/tools/books` |
| The eval-skills toolkit's `report.mjs` beside the runs (not shipped) | `eval-run-report.ts` writes one HTML report of every run to `.eval/agent/report/index.html` after each `npm run eval`, and on `npm run eval:report`; a missing `case-sources.json` is created with every case hand-written | `tests/evals/runner` |
| `@opentelemetry/api` as Bun resolves it | pinned to 1.10.0 (`overrides`), which Langfuse's exporters need under npm | `package.json` |
| The agent's user is the Supabase account | The pair (actor, data owner): `agent_users.data_owner_firebase_id`, resolved per request (`resolveAgentUserId`); every agent table follows | `mysql-agent-clients.ts`, `supabase-client.ts`, migration `2026-11-05_agent_actor_owner_scope.sql` |
| Row level security by user | Also by business: a conversation and its content (`AgentTable.business`) are reached only from the business they started in; list, search and the claim functions take it too | `mysql-agent-scope.ts`, `mysql-agent-tables.ts`, `mysql-postgrest-query.ts` (`userScopeConditions`), `mysql-postgrest-fetch.ts`, `mysql-agent-functions.ts` |
| Langfuse traces wherever its keys point | A remote Langfuse only from `LANGFUSE_TRACING_ENVIRONMENT=production` or with `LANGFUSE_ALLOW_REMOTE=true`; otherwise tracing is off with a `LANGFUSE_NOT_LOCAL` warning | `langfuse-tracing.server.ts` |
| LF files (macOS) | `.gitattributes` keeps LF in this package's working tree on Windows (`core.autocrlf=true` checked it out as CRLF, which oxfmt reported as 280 unformatted files) | `.gitattributes` |
| Template tests | 11 stale template tests brought in line with the template's current code (renamed playbooks, optional `areas`, `sendEmail` deferred, the chat's `locale`, the page's locale); no assertion weakened | `tests/` |

Not ported, with reason:

- The React UI and everything only the browser runs wait for the UI spec: `src/components`, `src/styles`, the pages' routes, `src/hooks`, the client state (`src/lib/**/*-atoms.ts`, `src/lib/atoms/*`), the server functions' client wrappers (`*-server-calls.ts`), browser analytics (`src/lib/analytics/*`), `src/lib/dates/*`, `src/lib/theme/*`, `src/lib/interaction/*`, the client i18n helpers (`app-direction.ts`, `app-locale-switch-atom.ts`, `typed-text-direction.ts`), `src/lib/perf/journey-timing-report.ts`, the UI's labels and views (`tracking-task-labels.ts`, `tracking-task-view.ts`, `agent-action-labels.ts`, `settings-dialog-section.ts`, `task-opportunity-filters.ts`), `user-state-writes.ts`, `split-text-graphemes.ts`, the chat's client code (`agent-chat-attachments.ts`, `agent-chat-conversation-actions.ts`, `agent-chat-conversation-markdown.ts`, `agent-chat-queue.ts`, the dictation's client files), the client auth helpers, the e2e journeys, and the two tests of the dropped client code (`agent-chat-conversation-list.test.ts`, `agent-chat-queue.test.ts`). The shadcn lint preset and the TanStack and react-doctor lint plugins go with them (`oxlint.config.ts`).
- Supabase sign-in, sign-up and its email-link callback (`src/lib/auth/auth-session.ts`, `src/routes/auth/callback.ts`) are Firebase's in KeepInTax; `readAgentSession` gives the pages the user's agent id instead.
- The Postgres migration is replaced by the MySQL one. Each SQL statement is capped at 30 seconds, as the template capped its service client's requests.
- `src/server/agent-ports.server.ts` gains two lint directives on its example stubs (their `Error` failures are the template's port contract).

## Open decisions before production

- The Docker image uses Node 18 and does not build the agent; the agent needs Node 22+, `npm ci --omit=dev` in `backend/agent` and `npm run build` (with dev dependencies) in the build stage.
- Legacy agent data: rows from before 2026-11-05 (`agent_users.data_owner_firebase_id IS NULL`) are kept and never served. `keepintax-dev` had none when the migration ran; production has no agent tables yet. Deleting such rows is a separate, explicit decision (the statement is in the migration's header).
- Install Docker (or another way to run Langfuse's compose file) for the local Langfuse; until then development traces nothing.
- `agent_users` is not linked to KeepInTax's users: deleting an account does not delete its agent data yet.
- Behind a TLS proxy, set Express's `trust proxy` or rely on `AGENT_APP_ORIGINS` for the origin check.

## The database

The agent's tables (`backend/scripts/migrations/2026-10-22_agent_harness_schema.sql`) mirror the template's migration column for column, in the repository's MySQL conventions (DATETIME(6) in UTC, uuids as CHAR(36), utf8mb4). `2026-11-05_agent_actor_owner_scope.sql` adds `agent_users.data_owner_firebase_id` (unique with `firebase_id`) and `agent_chat_conversations.business_number`. Applied migrations are never edited: a change is a new dated script. The gateway's table registry (`backend/shared/mysql/mysql-agent-tables.ts`) states each column's kind, each table's key, its business scope and who may do what; a column added to a table is added there too, and to `src/lib/supabase/` as the template does. Never `synchronize`.

## Isolation

Who reaches what, and where it is enforced:

| Rule | Enforced by |
| --- | --- |
| The client an accountant (or an admin) acts for comes from the verified Firebase token and an ACTIVE delegation (or the actor's ADMIN role), never from a header alone | `FirebaseAuthGuard` (unchanged), before any agent code |
| The business must be one of the data owner's numbered businesses; without a header, the owner's only one, else none (the tools then ask) | `AgentDomainService.requestBusiness`, in `AgentHarnessController` (403 `AGENT_BUSINESS_FORBIDDEN`) |
| The agent's user is the pair (actor, data owner): conversations, messages, stream, steers, follow-ups, documents, memory, earlier results, settings, usage, tasks and notifications all belong to it | `resolveAgentUserId` and the gateway's user scope |
| A conversation and its content belong to the business it started in: list, search, read, chat (claim), stream, stop, steer and follow-ups treat one from another business as missing; no write moves it | `userScopeConditions`, `assertOwnedConversations`, `assertNoTakeover`, the claim/list/search functions |
| Memory belongs to the pair, across the owner's businesses (a person's preferences, not a business's data) | the registry: `agent_memories` has no business scope |
| A conversation id authorizes nothing: another scope's id reads as missing (stream 204, steer 409, chat 404, rename/delete no-op) | the gateway's scope on every statement |
| Switching client or business: the page's earlier agent user is refused (401 `USER_STATE_OWNER_CHANGED`), the dev page locks the chat and starts a new one | `createOwnedSupabaseClient`, `/dev/agent` |
| Revoked access: new requests are refused by the guard (403); an answer already running fails its next tool call with `ACCESS_REVOKED`, whose next step tells the model to use nothing read earlier | `AgentDomainService.assertAccessStillHolds` |
| Legacy rows (no data owner) are kept, never matched, never reassigned | `resolveAgentUserId` reads `data_owner_firebase_id = ?` |

## queryExpenses

Reads through `ExpensesService.getExpensesByUserID` as the data owner, in one business, for a range of expense dates (inclusive, at most 10 years). The result separates:

- `totals`: APPROVED expenses booked to an account (`accountIdSnapshot` set), what the reports count (master plan D5/D6);
- `pending` (and `pendingByStatus`): PENDING, MISSING_ACCOUNTING_MAPPING, or no status;
- `approvedOutsideBooks`: APPROVED with no account, private expenses (D5), never in the business's reports;
- `excluded`: REJECTED or NOT_AN_EXPENSE (a count).

Amounts are ₪ with VAT included, summed in agorot, so groups (the 40 largest, the rest in `groupsOmitted`) add up to the totals exactly. Rows are at most 50 with `rowsOmitted`. Every search word must match (a second word never adds unrelated expenses); `filters` and `matchedClassifications` say what the numbers answer. A business without a number is never passed to the service (it would read every business). The instructions' `<books>` section tells the model to take every number from the tool, say the range, the business and what is not counted or left out, and leave tax decisions to the accountant.

## Checks

| Check | Command (in `backend/agent` unless noted) |
| --- | --- |
| Types | `npm run typecheck` |
| Lint and format | `npm run check` |
| Unit tests | `npm test` |
| Unit and MySQL integration tests | `AGENT_TEST_DATABASE_URL=mysql://root@127.0.0.1:3307/agent_test npx vitest run --project unit` |
| Bundle | `npm run build` |
| Nest edge | in `backend`: `npx jest src/agent-harness`, `npx nest build` |
| Dev page | in `frontend`: `npx ng build` |
| Evals (paid) | `npm run eval -- --variant <name> --reps 1 -t "query expenses"`, then `.eval/agent/report/index.html` |

The integration tests need a throwaway MySQL 8 with both migrations applied, named by `AGENT_TEST_DATABASE_URL`; without it they are skipped. Never point it at a shared or production database. A local one, without Docker: unzip MySQL 8.0's Windows archive, `mysqld --initialize-insecure` into a scratch folder, run it on port 3307 with a small buffer pool, create `agent_test` and apply the two scripts.

## Langfuse

- **Development:** a self-hosted Langfuse on your machine. Run Langfuse's official compose file (`git clone https://github.com/langfuse/langfuse.git`, then `docker compose up` in it), open http://localhost:3000, create a project and put its keys in `backend/.env` with `LANGFUSE_BASE_URL=http://localhost:3000`. Evals trace only to a local Langfuse (`vitest.config.ts` samples 0 elsewhere). The server enforces the same: outside production, a non-local `LANGFUSE_BASE_URL` (including the default, the cloud) turns tracing off and logs `LANGFUSE_NOT_LOCAL`; `LANGFUSE_ALLOW_REMOTE=true` sends traces there on purpose.
- **Production:** Langfuse Cloud: the cloud project's keys, `LANGFUSE_BASE_URL=https://cloud.langfuse.com` and `LANGFUSE_TRACING_ENVIRONMENT=production` (required: without it nothing is traced).

## Adapting it to KeepInTax

Follow the template's list ([TEMPLATE-GUIDE.md](TEMPLATE-GUIDE.md), "How to adapt it to your product") once the agent spec is ready, with these KeepInTax rules:

- Domain tools read KeepInTax's data through ports whose real implementations call the existing Nest services' rules, never the database around them, and keep the backend's boundaries: the data owner and delegation scopes from the request (`AgentRequestIdentity`), reading versus proposing versus approving, and `EXPENSES_APPROVE` for any accounting decision. An action that changes money or books waits for an approval card (`agent-tool-traits.ts` "approval").
- Accounting meaning comes from `docs/redesign/categories-redesign-master-plan.md`; the agent never decides a booking rule.
- Hebrew is the users' language: the instructions' Hebrew section and `messages/he.json`.
- New tables go through a new SQL script under `backend/scripts/migrations/`, never `synchronize`.
