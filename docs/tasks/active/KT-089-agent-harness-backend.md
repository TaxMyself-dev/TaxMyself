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

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
