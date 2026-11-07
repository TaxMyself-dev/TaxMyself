# KT-089 - Agent harness backend (template port)

- Status: `WORKER_COMPLETE`
- Task manager: Shoval Harel
- Worker: Claude Code (single-agent execution)
- Worktree: `C:\Users\user\Keepintax\TaxMyself-new-ai-assistant`
- Branch: `new-ai-assistant`
- Base commit: `5fbbc1eee884d30b79615b6e73802b67261442af`

## Business outcome

KeepInTax has a production-grade AI agent backend, built 1:1 on the team's
agent template (`agent-template-2026-10-22`), ready for the agent spec
(prompts, domain tools, playbooks, evals) and the chat UI spec to be filled
in. Until then, the domain parts stay marked `EXAMPLE`, as in the template.

## Acceptance criteria

- [x] A separate strict ESM package, `backend/agent/`, holds the agent with the
      template's packages and pinned versions (AI SDK 7, `@ai-sdk/openai`,
      Effect 4, Jev through `@typesafe-ai/sdk`, deepeval, vitest, Langfuse,
      anydoc), its tsconfig, lint and format configs.
- [x] Every harness mechanism is ported: tool loop, tool traits, approvals and
      action rules, error next steps, exclusive runner, null repair, output
      cuts, tool search and namespace rules, stop hooks, plan gate, turn gates,
      answer check, turn signals, adaptive reasoning, prompt cache, privacy,
      model retries, telemetry, usage, user context, long-term and short-term
      memory, earlier results, skills, attached documents, follow-ups, titles.
- [x] The chat runtime is ported: answer lease, stream chunks with resume,
      stop, steer, follow-ups, conversations (list, search, rename, pin,
      delete), memory and settings endpoints.
- [x] Storage runs on the existing MySQL, through hand-written SQL scripts; the
      template's Postgres functions become row-locking transactions; every
      query is scoped to the signed-in user in code (the template's RLS).
- [x] The NestJS backend serves the agent's endpoints behind
      `FirebaseAuthGuard`, through a thin module that hands the package the
      verified user.
- [x] Tracking tasks, opportunities, notifications, the background monitor and
      the task worker are ported as `EXAMPLE`, with sources not connected.
- [x] Langfuse traces go to a local Langfuse in development and Langfuse Cloud
      in production, chosen by environment variables.
- [x] The template's unit tests, eval runner, eval harness, judges,
      harnessing loop and trace mining/judging are ported and the unit tests
      pass; typecheck and lint pass.

## Scope and constraints

- In scope: `backend/agent/` (new package), a thin Nest agent module and its
  registration, SQL scripts for the agent's tables, `.env.example` entries,
  topic documentation.
- Out of scope: the chat UI (its spec is pending), final prompts, domain tools,
  playbooks and eval cases (the agent spec is pending), production rollout.
- Required reading: root `AGENTS.md`, coordination workflow and quality gates,
  `app-mapping/`, the agent template's `GUIDE.md` and source.
- Approval boundaries: no production database changes, no accounting writes,
  no changes to existing financial flows; SQL is written, not applied to
  production.

## Handoff

- Result: complete (backend; the UI waits for its spec, the agent's own
  prompts/tools/playbooks/evals for the agent spec).
- Commit hash(es): see `git log` on `new-ai-assistant` (KT-089 commits).
- Changed files: new `backend/agent/` package (the template's backend files,
  the MySQL gateway `backend/shared/mysql/`, the request runtime, the
  server-function builder, the HTTP entry, build and patch scripts, configs,
  GUIDE.md, TEMPLATE-GUIDE.md, AGENTS.md, new tests); new
  `backend/src/agent-harness/` (module, controller, service, spec,
  AGENTS.md); `backend/src/app.module.ts` (module registration);
  `backend/src/main.ts` (leaves `/api/agent/` bodies unparsed);
  `backend/scripts/migrations/2026-10-22_agent_harness_schema.sql`; root
  `AGENTS.md` topic map; this task file.
- Tests and exact results:
  - `npm run typecheck` (TypeScript 6 with Effect's diagnostics): exit 0.
  - `npm run check` (Ultracite: Oxlint type-aware + Oxfmt): exit 0.
  - `npm run build` (esbuild bundles): exit 0.
  - `vitest --project unit` with `AGENT_TEST_DATABASE_URL` on a local MySQL
    8.0.40: 274 tests, 263 passed, 11 failed (all 11 are the template's own
    stale tests, see below). New: 8 gateway integration tests on real MySQL
    (lease, messages, cross-user refusals, list/search, steers, memory,
    settings, tasks, opportunities, the monitor's claim/record/finish), 3
    HTTP-entry integration tests (session, settings, the chat request end to
    end, stream/stop, origin and user checks), 9 gateway unit tests, 3
    runtime tests.
  - Nest: `nest build` exit 0; `jest src/agent-harness`: 3/3 passed.
  - Manual: the compiled Nest service loaded the ESM bundle and answered
    `readAgentSession` from MySQL; the task worker started from the bundle
    and from source.
- Known pre-existing failures: the template's unit suite fails 12 of 258 on
  an untouched copy of the template (npm install, same Node): stale tests in
  agent-harness-tree (3), harness-context (1), agent-chat-errors (1),
  agent-chat-response (1), agent-user-context (2), agent-reasoning (3),
  short-term-memory (1). Here 11 fail: harness-context passes once git is
  found on Windows. Left as the template has them.
- Schema / production / security / accounting / external impact:
  - Schema: 16 new tables in a new SQL script; not applied to any shared or
    production database. Additive only.
  - Production: none deployed. The Docker image does not build the agent
    yet (it uses Node 18; the agent needs Node 22+ and its own npm install
    and build). Without the bundle, `/api/agent/*` answers 503 and nothing
    else changes.
  - Security: every agent route is behind FirebaseAuthGuard; the agent's
    data is scoped per user in the gateway (tested across two users); the
    cross-site guard accepts `AGENT_APP_ORIGINS`.
  - Accounting: none (no domain tools; no access to KeepInTax's financial
    tables).
  - External: OpenAI (gpt-6-luna), TypeSafe Jev, Langfuse, PostHog, Soniox
    only when their keys are set; none were called in the tests.
- Risks and manual checks: evals were not run (they need `OPENAI_API_KEY`
  and `TYPESAFE_API_KEY` and cost money); a real chat answer with the model
  was not exercised; apply the SQL to the development database and run one
  chat with keys; decide the Docker/Node upgrade before production.
- Review: four read-only subagents checked file coverage, the MySQL gateway,
  the runtime and Nest edge, and the eval tooling against the template; their
  findings were fixed (upsert permission and takeover checks on every unique
  key, uuid and boolean validation, binary collation, strict SQL mode, due-task
  claims locking only claimed rows, scan input validated as Postgres casts it,
  logged background failures with a scoped rejection guard, body limits,
  shutdown hooks, route failures recorded as 500, Windows-safe eval case ids,
  a CLAUDE_CLI_PATH override, a production-safe postinstall). Open decisions
  are listed in backend/agent/GUIDE.md.
- Documentation updated: `backend/agent/GUIDE.md`, `backend/agent/AGENTS.md`,
  `backend/src/agent-harness/AGENTS.md`, root `AGENTS.md`, this file.

## Follow-up 2026-11-05: isolation, queryExpenses, tests

- Status: `WORKER_COMPLETE` for the code; end-to-end chat with the real
  model, the five evals and local Langfuse are **blocked** (below).
- Commits: `5cc6beb4` (LF working tree, current template tests),
  `1044b854` (isolation by actor/owner/business, queryExpenses semantics),
  `887eb9b0` (dev page context binding, local-only dev tracing), and the
  documentation commit after it.
- Schema: `backend/scripts/migrations/2026-11-05_agent_actor_owner_scope.sql`
  (new; the 2026-10-22 script unchanged). Applied to a disposable MySQL
  8.0.40 (also over legacy rows) and to `keepintax-dev`, whose agent tables
  were empty (no legacy data). Not applied to production.
- Legacy data policy: rows without a data owner are kept and never served
  or reassigned; deleting them is a separate decision.
- Results:
  - agent `npm run typecheck` 0; `npm run check` 0 (was: 280 format
    issues, from CRLF, and 1 lint error); `npm run build` 0.
  - agent vitest with `AGENT_TEST_DATABASE_URL` (disposable MySQL):
    58 files, 294/294 passed, 0 skipped (was 259 passed, 11 failed, 11
    skipped). Without the database: 3 integration files skipped.
  - Nest `npx jest src/agent-harness`: 3 suites, 33/33; `nest build` 0.
  - Frontend `ng build` (production) 0; warnings only pre-existing budgets
    and CommonJS notices.
  - Domain E2E against `keepintax-dev` (compiled service in a Nest
    context, read-only): 13/13 checks equal to independent SQL (fuel over
    Q1 2026 in each of an owner's two businesses, no results, grouping,
    month boundaries, no business chosen, foreign business by header and by
    number, an accountant's active client, a revoked delegation).
  - Full backend Jest (`--runInBand`): **completed** (corrected: the
    earlier handoff read the log mid-run and wrongly said it stopped
    early). 170 suites, 1,631 tests: 1,621 passed, 10 failed in 9 suites,
    none in or importing `src/agent-harness`: documents/document-kind (2),
    bookkeeping/catalog-context.service (3), demo-data/direct-card-demo
    profile (1), reports/report-review-focus (1), reports.controller (1),
    reports.service (1), users.service (1); two more suites
    (users/auth.service, users/users.controller) failed to run without a
    failed assertion. The backend diff is confined to `src/agent-harness`,
    so these run the base's code; the earlier session also recorded 10
    failures on `main`. Log: the session scratchpad `jest-full.log` /
    `jest-full.json`.
- Blocked, not verified: browser test of `/dev/agent` with real Firebase
  login and the real model (no `OPENAI_API_KEY` in `backend/.env`; no
  browser tool in this session), the five expense evals (same key, paid),
  local Langfuse (Docker is not installed). `backend/.env` points at
  Langfuse Cloud: the server now refuses it outside production.
- Dev data limit: every expense in `keepintax-dev` is APPROVED and
  booked, so pending/private/rejected buckets are covered by unit tests
  only.

## Follow-up 2026-11-05 (2): several businesses, local Langfuse, evals

- Status: **incomplete.** Code, tests and service-level E2E are done; the
  evals, the real-model browser test and local Langfuse traces are
  blocked (no `OPENAI_API_KEY` anywhere on this machine; no Docker or WSL).
- Product decision applied: a conversation covers one, several or all of
  the same data owner's businesses; switching business keeps it; switching
  client never carries it over. Conversations and memory are scoped by
  (actor, data owner); the active business is the tools' default.
- Commit: `16174160` (and the documentation commit after it). No new
  migration: the 2026-11-05 columns are kept; `business_number` now records
  where a conversation started and is no access boundary.
- queryExpenses: `businessNumbers` / `allBusinesses` run the same query in
  each business; every number is validated first (a foreign one refuses the
  whole query); the combined totals are added in agorot; a failing
  business is listed and leaves `combined` null; a revocation midway ends
  the query with nothing returned.
- Results:
  - agent typecheck 0, check 0, build 0; vitest with the disposable MySQL:
    59 files, 301/301 passed, none skipped.
  - Nest `jest src/agent-harness`: 42/42 (9 new multi-business cases);
    `nest build` 0; Angular production build 0.
  - Domain E2E against keepintax-dev (read-only, compared with SQL): 15/15,
    including fuel Q1 2026: 111111118 ₪900 + 222222226 ₪1,200 = ₪2,100.
  - Evals: 8 cases collected by `-t "query expenses"` (5 existing, 3 new
    multi-business); **not run** (no OpenAI key).
- Local Langfuse prepared, not running: `C:\Users\user\langfuse-local`
  (official compose file, override to host port 3100, generated secrets
  and headless project `keepintax-agent-dev` in a git-ignored `.env`).
  `backend/.env` points the agent at `http://localhost:3100` with the
  local keys (the cloud keys kept as comments). All needed host ports were
  free.
- To unblock: add `OPENAI_API_KEY` to `backend/.env`; install WSL and
  Docker Desktop, then `docker compose up -d` in
  `C:\Users\user\langfuse-local`.

## Follow-up 2026-11-07: admin-panel entry to the chat

- The admin panel has a `צ׳אט AI` tab, present only where the `/dev/agent`
  route is (one shared flag, `pages/dev-agent/dev-agent.route.ts`). It
  navigates to the existing chat page with `from=admin-panel` and passes on
  a local `?api=` override; the chat page reads `api`/`from` from the route
  and shows `→ חזרה לפאנל הניהול`, which returns with the same override.
- No change to authorization: `/admin-panel` keeps `AuthGuard` +
  `AdminRouteGuard`; `/dev/agent` keeps `AuthGuard` and sends the Firebase
  token; actor/owner/business isolation is untouched (backend only).
- No port is configured anywhere: 3011 is given only as
  `/admin-panel?api=http://localhost:3011/`.
- Focused specs: `npx ng test --ts-config tsconfig.admin-ai-chat.spec.json
  --include src/app/pages/admin-panel/admin-panel.page.spec.ts --include
  src/app/pages/dev-agent/dev-agent.route.spec.ts --watch=false
  --browsers=ChromeHeadless`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
