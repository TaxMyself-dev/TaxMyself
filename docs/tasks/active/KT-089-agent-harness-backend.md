# KT-089 - Agent harness backend (template port)

- Status: `WORKER_COMPLETE` (Phase 3 implemented and verified locally; manager review of the local commit pending; earlier template port complete)
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

## Follow-up 2026-11-08: local main merged into the feature branch

- Authorized by Elazar: merge local `main` into `new-ai-assistant` only (no
  integration into `main`, no push). Feature HEAD before: `66b11cdb`; merged
  main: `a027d1c9` (188 commits ahead, 11 behind at the start).
- Conflicts (both additive, both sides kept):
  - `backend/src/app.module.ts`: main's
    `ScheduleModule.forRoot(devCompletionScheduleOptions())`, `LycheeModule`,
    dev-only `WhatsappDevelopmentModule`, `ReadinessService`, plus
    `AgentHarnessModule` (imported and registered once).
  - `frontend/src/environments/environment.ts`: `agentDevPage: true` and
    `requireMfa: false`.
- Reviewed auto-merges: `backend/src/main.ts` keeps `enableShutdownHooks()`
  and the `/api/agent/` JSON-parser bypass next to main's path-scoped
  Lychee/Mailgun parsers and dev-completion gate; `FirebaseAuthGuard` keeps
  its request contract (main adds env-gated MFA, `AUTH_MFA_REQUIRED`, and
  security-event logs); routing keeps `/dev/agent` and `/admin-panel`.
  Main's `backend/package.json` change is scripts only; no lockfile was
  changed on both sides; no Docker change on main. No compatibility code
  change was needed; `backend/agent` is byte-identical to `66b11cdb`.
- Note for the agent spec (no behavior change made): main added
  `Business.proprietorRole` (`PRIMARY`/`SPOUSE`). The agent's businesses
  are still the account's businesses (`getUserBusinesses(firebaseId)`), so
  a spouse's business on the same account is included in combined totals.
- Results (logs in the session scratchpad `merge-logs/`):
  - agent `npm run typecheck` 0; `npm run build` 0; `npm run check`: Oxfmt
    passed (315 files), Oxlint **blocked** — Windows Application Control
    now blocks the Effect-patched, unsigned `tsgolint.exe` (Code Integrity
    event 3077); type-aware lint did not run.
  - agent vitest with `AGENT_TEST_DATABASE_URL` on a new disposable MySQL
    8.0.40 (127.0.0.1:3317, `agent_test`, both agent migrations applied):
    `--maxWorkers=4` 59/59 files, 301/301 tests, 0 skipped. With default
    workers 3 runs gave 298 passed, 3 skipped: the 10 s `beforeAll` import
    in `agent-http-integration.test.ts` times out under load (the file
    alone: 3/3). Unchanged code, not a merge regression.
  - Nest `npx jest src/agent-harness` 3 suites, 42/42; `nest build` 0.
  - Frontend admin-chat specs 13/13; `ng build --configuration production` 0
    (pre-existing budget/CommonJS warnings only).
  - Full backend `jest --runInBand`: 229/230 suites, 2433/2434 tests. The
    failure, `admin-billing-resolution.spec.ts` "resumes only local token
    completion for a ACTIVE subscription" (expects ACTIVE, gets PAST_DUE;
    the fixture's period ended 2026-11-05 against the real clock), fails
    identically on `a027d1c9` in an isolated detached worktree: baseline.
- Known eval findings, unchanged and out of scope (run `expenses-local-1`,
  not rerun): 4 apparent number-origin false positives (`299.9` vs
  `299.90`); 1 answer with the correct combined total but without the
  required per-business subtotals.

## Phase 3 follow-up — 2026-11-11 (verified locally)

This is the existing feature, continued on `new-ai-assistant` from
`8d249ff6`, in the existing worktree. Phase 3 is authorized; other unbuilt
phases of `docs/plans/ai-agent-tools-plan.md` are not included. The status
of the template port above does not mean Phase 3 verification is complete.

### Implemented scope

- Nine read-only ports and tools: `queryTransactions`,
  `queryIssuedDocuments`, `listCategories`, `listClients`,
  `getProfitAndLoss`, `getVatSummary`, `getAdvanceTaxStatus`,
  `listUpcomingReports`, `getReportReadiness`.
- The Nest implementation uses the existing services, the verified data
  owner and an owned business. Active delegation/admin authorization is
  checked before reading and again before returning a result. Issued
  documents retain the existing INVOICES module check.
- Reports use their existing builders and period rules. The agent does
  not run depreciation preparation, inbox processing, document pairing,
  matching, workflow generation or task insertion. Readiness describes
  rows already available, not unprocessed Drive files.
- Issued documents are separated by type and currency. A foreign amount
  is never presented as shekels without a recorded conversion. Unlinked
  transactions, unsuccessful syncs and missing conversions make bank
  totals partial. An unmatched account filter returns owned account names
  for a narrower retry.
- No database schema, tax rule or accounting calculation is changed.
  The existing `queryExpenses` implementation and query semantics remain
  unchanged.

### Independently executed verification

The manager reviewed the implementation diff and the actual results,
including the read-only service paths, ownership/revocation checks,
currency semantics, periods and numeric-source checks.

- Baseline on `8d249ff6`: full backend Jest, 229/230 suites and
  2,433/2,434 tests passed. The sole failure was
  `Admin resolution runtime and authorization resumes only local token
  completion for a ACTIVE subscription`: the fixture period ended on
  2026-11-05, so the current clock yields PAST_DUE instead of ACTIVE.
- Full backend verification after the currency/account corrections:
  233/234 suites and 2,477/2,478 tests passed, 489.522 seconds. JSON
  comparison with the baseline confirms the same single failure and
  **44 additional passing tests**, with no new failure.
- Nest build after those corrections: exit 0. Focused AgentBooksService
  verification: 37/37 tests and scoped ESLint exit 0.
- After the last two additive result fields (issued-document `count`;
  `listUpcomingReports.activeBusiness`, the verified active business):
  focused AgentBooksService 38/38 tests, scoped ESLint exit 0, and Nest
  build exit 0 (`phase3-backend-active-context-build.log`). The full
  backend Jest run above was **not** repeated after these two fields.
- Final agent verification on the current code (after the routing,
  active-default and `activeBusiness` changes), started 18:07:36: 61/61
  files, 325/325 tests, zero skipped, 27.57 seconds
  (`phase3-agent-active-context-unit.log`); typecheck, Ultracite check and
  build all exit 0. This supersedes the earlier 325-test runs.
  Tests used a dedicated local disposable MySQL on 127.0.0.1:3318 with
  the two existing agent migrations. No application schema was added.
- After the final `queryIssuedDocuments` description change (cancelled
  and not-issued documents stated as excluded; no service or calculation
  change): focused agent verification 3/3 files, 35/35 tests, zero
  skipped, 3.63 seconds at 18:32:37 (`phase3-exclusions-focused-unit.log`),
  with only the intended tools snapshot updated; typecheck and Ultracite
  check exit 0; build exit 0 (`phase3-agent-exclusions-build.log`). The
  full 325-test database run above precedes this description change and
  was not repeated (the disposable MySQL had been stopped).
- `git diff --check` and the staged equivalent passed. Only the intended
  instructions/tools prompt snapshots changed; original prompt budgets
  remain unchanged. The frontend was not modified or rebuilt in this
  follow-up.

The full backend run precedes the additive issued-document `count` and
`listUpcomingReports.activeBusiness` fields; focused service checks and
the Nest build were rerun after both fields.
The agent counts above include the final evidence correction: discovery
schemas and unrelated tool results cannot back book numbers. It is not a
change to financial calculations.

### Evaluation status

Thirty new Hebrew cases are written, with fixed fake ports and strict
numeric checks, plus Hebrew/content/currency judges. Paid runs use small
filtered batches with three repetitions per case, not the entire indexed
template dataset.

- Transaction baseline: 11/15 combined passes. An account-name mismatch
  and an unclear exclusion caveat were corrected.
- Transaction follow-up: 15/15 code checks, 12/15 combined passes. The
  three partial-sync judge failures were inspected against the returned
  account subtotal and found to be false alarms. The updated case also
  requires the actual Visa subtotal, which the baseline case omitted.
  Judge wording was clarified for date components and unconverted items;
  pass thresholds were not lowered. This is not an unchanged-grader
  comparison. The recorded train/test deltas are within noise.
- Issued-document baseline: 15/15 code checks, 13/15 combined passes.
  Review found that a discovery schema could supply incidental digits to
  the numeric check, and that an empty document search must not establish
  whether a saved customer exists. Both corrections are implemented.
- Issued-document follow-up: 15/15 strict books-only code checks and
  13/15 combined passes. The currency case passes all three repetitions
  with an explicit service count. The Omega answers no longer infer saved
  customer absence from a document search. Two judge flags remain: a
  correct date range, and cancelled/draft documents explicitly listed
  separately from the count of issued documents. The returned figures
  match the answers; these flags remain in the saved report.
- Categories/clients baseline (`phase3-b3-catalog`): 8/9 code checks and
  8/9 combined. The failure was a **real routing
  error**: "categories waiting for the accountant" answered from pending
  expenses (`queryExpenses`), without `listCategories`.
- P&L/VAT baseline (`phase3-b4-pnl-vat`): 19/24 combined. Real defects:
  first-quarter income read from issued documents and added across types
  (3/3; the number check forced a correction); an answer that overrode the
  active business with the first one of a list (exempt case, 1/3). One
  year-profit answer named the settings fixture's business ("Northwind
  Bookkeeping") instead of the result's `business.name`: an attribution
  defect the deliberately mismatched fixtures expose.
- Remaining reports baseline (`phase3-b5-reports-rest`, 9 cases): 23/27
  combined. Real defect: the readiness-count case asked which business
  after `listUpcomingReports` instead of using the active one (2/3).
  False alarms on source review: revoked access (explicit no access, no
  figure) and the before-report currency statement (no shekel figure for
  Canva; confidence 0.02).
- Corrections: a compact routing rule in `<books>` (P&L for booked income,
  expenses or profit; transactions for bank/card money; issued documents;
  categories and mapping; expenses), the active-default and business-name
  rules, and — after the readiness rerun still asked in 2 of 3 repetitions —
  the missing read context itself: `listUpcomingReports` now returns `activeBusiness`
  and its selector says truthfully that leaving it out lists all
  businesses. The exempt case now asserts every VAT read leaves the
  business out or names the workshop. No threshold was lowered.
- Reruns on the corrected code: categories/clients
  (`phase3-b3-catalog-v2`) 9/9; P&L, VAT and readiness count
  (`phase3-b4b5-reports-v2`, 9 cases) 24/27 combined, first-quarter income
  3/3, exempt 3/3, readiness count still 1/3 before `activeBusiness`;
  active-business subset (`phase3-active-v3`: readiness count, exempt VAT,
  3 upcoming-reports cases) 15/15. The refund flag in
  `phase3-b4b5-reports-v2` is a judge false alarm on the sign
  (`vatToPay: -649.8` stated as a refund of
  649.80 ₪; deterministic check passed).
- `queryExpenses` regression (`phase3-expenses-regression`, the 5 cases of
  `query-expenses.eval.ts`, 3 repetitions): 15/15 combined, against 3/5 in
  `expenses-local-1` (1 repetition). No regression.
- Latest recorded result per case and repetition across the ordered runs
  B1v2, B2v2, B3v2, B5rest, B4B5v2 and active-v3 (a later run overrides
  the same case and repetition): 30 cases, 90 slots, 90/90 code checks
  and 82/90 combined. Historical flag: the September documents case (1) was
  a **real minor wording gap** (cancelled and draft documents listed apart
  but not said to be excluded).
- September exclusion wording closed: the `queryIssuedDocuments`
  description now says cancelled and not-issued documents are excluded
  from the count and every total, and to say so when either is above
  zero. Rerun of that case only (`phase3-b2-september-v3`, compared with
  `phase3-b2-documents-v2`): 3/3, the answers stating the exclusion.
- Final latest-per-case union, adding September-v3: 30 cases, 90 slots,
  **90/90 code checks and 83/90 combined**. This is a union across
  bounded revisions, not one 90-slot run of the final revision. The 7
  remaining flags are judge false alarms on source review: partial sync
  (3: every figure in the results), the empty-client case (1: a correct
  date read as unsupported), the VAT refund (1: the sign rendered as a
  refund), revoked access (1: explicit no access, no figure) and the
  readiness currency statement (1: no shekel figure for Canva).
- Open items, not fixed in Phase 3: the judge's numeric statement still
  misreads a subtotal the tool returned and a sign rendered as a refund
  (no threshold or wording change was made to pass them); a residual
  Hebrew style limitation, singular forms such as "שהוצאת" in more than
  one answer (not graded).
- Documentation link check (manager): 10 Markdown files, 9 local links, 0
  broken. The repository has no root link-check script.
- Independent offline re-audit of the recorded answers, using the actual
  numeric normalizer and **only successful books/report outputs** as
  evidence: transaction follow-up 15/15; document baseline 12/15. All
  three document misses are the currency case's count `3`, which was
  present only in the discovery schema, not the document result. This
  confirms the evidence defect and the need for an explicit service count.
  This audit is not a new model run and does not rewrite the saved grades.

### Delivery boundary

No feature changes have been integrated into local main, pushed, deployed
or run against production. Local commits are permitted after review and
documentation updates. Main integration and GitHub push require Elazar's
separate explicit approvals. The three pre-existing untracked files
(`backend/journey-timings.local` and the two agent conversation plans)
remain outside the change.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
