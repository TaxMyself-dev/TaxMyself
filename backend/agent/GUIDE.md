# KeepInTax agent: guide

This package is the KeepInTax AI agent's backend, ported 1:1 from the team's agent template (`agent-template-2026-10-22`; its own guide is kept verbatim in [TEMPLATE-GUIDE.md](TEMPLATE-GUIDE.md)). The harness is the template's, file for file: the agent and its tool loop, the tool runtime (traits, approvals and action rules, error next steps, the exclusive runner, null repair, output cuts, tool search and namespace rules), the turn (stop hooks, plan gate, turn gates, answer check, turn signals, follow-ups), the model (prompt cache, privacy, adaptive reasoning, visible retries, telemetry, usage), memory (long-term, short-term folding, earlier results), skills, attached documents, the chat runtime (answer lease, resumable streams, stop, steer, titles), the tracking tasks and their background monitor, and the tests, evals, harnessing and trace mining.

The product chat UI and the remaining agent phases are not implemented here. A dev-only Angular test page is at `/dev/agent`. KeepInTax's books and reports tools are implemented (Phase 3); verification and recorded eval outcomes are tracked in [KT-089](../../docs/tasks/active/KT-089-agent-harness-backend.md). The template's unrelated domain examples remain `EXAMPLE`.

## What exists today

| Layer | State |
| --- | --- |
| **Ported from the template** (infrastructure) | The whole harness and chat runtime listed above, the MySQL gateway standing in for Supabase, the eval runner, harnessing and trace mining. Unit and MySQL integration tests pass (see "Checks"). |
| **KeepInTax isolation** | The agent's user is the pair (actor, data owner): conversations and memory never cross to another client. One conversation covers any of that owner's businesses; the business is the one the user names or established in the conversation, never the page's header ("Business selection"). Revoked access stops even an answer already running (see "Isolation"). |
| **Working business capability** | `queryExpenses` retains its existing single/multiple-business behavior. Nine further read-only books/report tools use the existing Nest services; see "Books and reports reads" below. Paid Hebrew evals use fake ports and local traces; exact results and limitations are in KT-089. |
| **Chat interaction (Phase 3.1, KT-108)** | No profile or onboarding questions in ordinary requests; one list of supported capabilities; the template's web, email, tracking and playbook tools kept registered but not offered; `askUserQuestion` answered by the page with validated values, continuing the same answer; turn origins recorded; tool-call idempotency keys for created rows; memory `kind` (`business_fact`) held in the content. See "Phase 3.1: chat interaction" below. |
| **Not built** | The remaining phases of `docs/plans/ai-agent-tools-plan.md` (3.2 onward), the product chat UI, the background jobs. The template's example tools (`searchWeb`, `sendEmail`, tracking tasks) still have no real domain sources and are not offered in chat. |

**For a coding agent:** treat every file under `src/agent`, `src/lib`, `src/server` (except the files named under "What KeepInTax changed"), `backend/monitor`, `backend/shared` (except `mysql/` and `supabase/`) and `tests` as the template's reviewed code. Read the comment at the top of each file before changing it. When the template changes, port its change file for file.

## Quick start

1. In `backend/agent`: `npm install` (Node 24; it also runs the DeepEval patch and compiles the messages).
2. Apply, in order, `backend/scripts/migrations/2026-10-22_agent_harness_schema.sql` (new tables) and `2026-11-05_agent_actor_owner_scope.sql` (the (actor, data owner) key; the business a conversation started in) to the database the backend uses, development first. Both are applied on `keepintax-dev` (2026-11-05). Never apply them to production without the team's go-ahead.
3. Put the agent's keys in `backend/.env` beside the backend's own (see `.env.example`): `OPENAI_API_KEY`, `TYPESAFE_API_KEY`, `AGENT_APP_ORIGINS`, and the Langfuse keys with `LANGFUSE_BASE_URL=http://localhost:3100` (see "Langfuse": in development a cloud URL turns tracing off).
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
| Example domain ports only | KeepInTax's ports (`keepintax-ports.ts`): the Nest backend passes `handleAgentHttpRequest` a verified-user domain combining the existing expenses service and `AgentBooksService`, carried in the request context | `src/agent/core/ports/keepintax-ports.ts`, `src/server/agent-ports.server.ts`, `src/agent/tools/books`, `src/agent/tools/reports`, `backend/src/agent-harness` |
| Template answer checking | After an attempted books/report read, deterministic number checking trusts only successful books/report results from the same turn; schemas, memory, web, failed/denied reads and user-supplied amounts provide no book-number evidence. Jev remains the semantic check | `src/agent/core/turn/agent-answer-check*.ts`, `agent-tool-traits.ts`, books instructions and prompt snapshots |
| The eval-skills toolkit's `report.mjs` beside the runs (not shipped) | `eval-run-report.ts` writes one HTML report of every run to `.eval/agent/report/index.html` after each `npm run eval`, and on `npm run eval:report`; a missing `case-sources.json` is created with every case hand-written | `tests/evals/runner` |
| `@opentelemetry/api` as Bun resolves it | pinned to 1.10.0 (`overrides`), which Langfuse's exporters need under npm | `package.json` |
| The agent's user is the Supabase account | The pair (actor, data owner): `agent_users.data_owner_firebase_id`, resolved per request (`resolveAgentUserId`); every agent table follows | `mysql-agent-clients.ts`, `supabase-client.ts`, migration `2026-11-05_agent_actor_owner_scope.sql` |
| Row level security by user | The agent's user is the pair (actor, data owner); a conversation records the business it started in (`business_number`, `AgentTable.recordsBusiness`), written by the gateway only and never changed — a record, not an access boundary | `mysql-agent-scope.ts`, `mysql-agent-tables.ts`, `mysql-postgrest-fetch.ts`, `mysql-agent-functions.ts` |
| Langfuse traces wherever its keys point | A remote Langfuse only from `LANGFUSE_TRACING_ENVIRONMENT=production` or with `LANGFUSE_ALLOW_REMOTE=true`; otherwise tracing is off with a `LANGFUSE_NOT_LOCAL` warning | `langfuse-tracing.server.ts` |
| LF files (macOS) | `.gitattributes` keeps LF in this package's working tree on Windows (`core.autocrlf=true` checked it out as CRLF, which oxfmt reported as 280 unformatted files) | `.gitattributes` |
| Template tests | 11 stale template tests brought in line with the template's current code (renamed playbooks, optional `areas`, `sendEmail` deferred, the chat's `locale`, the page's locale); no assertion weakened | `tests/` |
| `<profile_gaps>` from the example settings, `<missing_details>`, the memory rule asking for the user's name, the small-talk hint pointing to the gaps, the `new-user-setup` and `research-brief` playbooks (Phase 3.1, §2.10, A19) | Removed. The user context lists only account, business name, website, languages and writing style (not the lead-generation fields). `<clarification>`: ask only what the current request cannot be completed without. No playbook is offered, so no skill list is sent and `loadAgentSkill` is not offered; the retired names still validate in stored calls and load nothing | `agent-user-context.ts`, `agent-instructions.ts`, `long-term-memory.server.ts`, `agent-turn-signals.ts`, `agent-skills.ts`, `agent-skill-tool.ts` |
| Role paragraph, `<tasks>`, follow-up writer and app knowledge advertising tracking tasks, web search and email (Phase 3.1, §2.6) | One list of supported and not-yet-available capabilities feeds the role paragraph, `<scope>`, the follow-up writer and `readAppKnowledge`'s how-it-works; a request for books monitoring is answered as not available, creating nothing | `agent-capabilities.ts`, `agent-instructions.ts`, `agent-follow-up-questions.ts`, `app-knowledge.ts` |
| `searchWeb`, `sendEmail` and the web-only tracking, suggestion and opportunity tools offered in chat (A16, A17) | Kept registered (stored messages validate against `appAgentTools`) but never offered: every step's `activeTools` is the offered set, the deferred-tools line lists only offered tools, and `agentChatToolApproval` denies a hidden tool with `AGENT_TOOL_NOT_AVAILABLE` if called anyway. The template's `agentToolApproval` and the `email` namespace are unchanged | `agent-capabilities.ts`, `app-agent.ts`, `agent-tool-search.ts`, `agent-tool-approval.ts` |
| `askUserQuestion` executes and returns `{ asked: true }`; the pick arrives as the next user message; `agentAskedUser` stops the loop (A18) | No `execute`: the loop stops on the open call. Options are `{ label, value }` (a string still validates, as its own value), 2 to 6. The page answers the stored part; `agent-chat-question-answers.ts` (beside `agent-chat-approvals.ts`) accepts only an open question's own value, once, writes `{ value, label }` from the stored option, and the same answer continues with the original request in the turn. A typed message closes an open question as `{ superseded: true }` and saves it. A stale, repeated or other-tab press is `409 AGENT_QUESTION_CLOSED`; a value not offered is `400 AGENT_QUESTION_ANSWER_INVALID`. `BUSINESS_REQUIRED`'s next step asks with business numbers as values (and `all` for `queryExpenses`) | `ask-user-question-tool.ts`, `agent-chat-question-answers.ts`, `agent-chat-message-preparation.server.ts`, `agent-tool-error-next-step.ts`, `app-agent.ts` |
| No record of how a turn was started (§2.7 item 4) | A server-written `data-turnOrigin` part: `typed` or `follow-up` on the user's message (a follow-up only when the page sends `origin: "follow-up"` and the text is one of the last answer's stored follow-ups), `question-answer` or `approval` on a continued answer. Never shown, never read by the model. One rule acts on it now: a `follow-up` turn runs no `write` tool (`AGENT_FOLLOW_UP_NO_WRITE`). The other origin rules are Phase 3.2 | `agent-chat-turn-origin.ts`, `agent-chat-request.server.ts`, `agent-tool-approval.ts` |
| Writes without idempotency keys (§2.7 item 6) | `agentToolCallKey(conversation, toolCallId)`: a created memory or tracking task takes it as its id and is not created twice; updates and deletes repeat to the same result. No schema change | `agent-tool-idempotency.ts`, `agent-memory-tools.ts`, `long-term-memory.server.ts`, `tracking-task-tools.ts` |
| Memory is free text (A12, A20) | `saveAgentMemory`/`updateAgentMemory` take `kind` (`preference` or `business_fact`); a business fact is stored with the content prefix `[business_fact] ` until Phase 4's migration adds the column and moves it to the profile. An update keeps the kind. Stable facts the user states are saved with a stated notice; the dev page shows "saved" with undo | `long-term-memory.server.ts`, `agent-memory-tools.ts` |
| Evals of removed behavior | `missing-details.eval.ts` inverted (no profile questions); new `interaction/chat-interaction.eval.ts` (S1–S4, S6, S10–S12); eval harness gains page answers, follow-up presses with origin, superseding, and the fake database honours upserts. Cases whose subject is a hidden capability are `skip`ped with a reason (tracking tasks, opportunities, setup, playbooks, approvals over task deletion and email, simulated and mined chats, five single cases) | `tests/evals` |

Not ported, with reason:

- The React UI and everything only the browser runs wait for the UI spec: `src/components`, `src/styles`, the pages' routes, `src/hooks`, the client state (`src/lib/**/*-atoms.ts`, `src/lib/atoms/*`), the server functions' client wrappers (`*-server-calls.ts`), browser analytics (`src/lib/analytics/*`), `src/lib/dates/*`, `src/lib/theme/*`, `src/lib/interaction/*`, the client i18n helpers (`app-direction.ts`, `app-locale-switch-atom.ts`, `typed-text-direction.ts`), `src/lib/perf/journey-timing-report.ts`, the UI's labels and views (`tracking-task-labels.ts`, `tracking-task-view.ts`, `agent-action-labels.ts`, `settings-dialog-section.ts`, `task-opportunity-filters.ts`), `user-state-writes.ts`, `split-text-graphemes.ts`, the chat's client code (`agent-chat-attachments.ts`, `agent-chat-conversation-actions.ts`, `agent-chat-conversation-markdown.ts`, `agent-chat-queue.ts`, the dictation's client files), the client auth helpers, the e2e journeys, and the two tests of the dropped client code (`agent-chat-conversation-list.test.ts`, `agent-chat-queue.test.ts`). The shadcn lint preset and the TanStack and react-doctor lint plugins go with them (`oxlint.config.ts`).
- Supabase sign-in, sign-up and its email-link callback (`src/lib/auth/auth-session.ts`, `src/routes/auth/callback.ts`) are Firebase's in KeepInTax; `readAgentSession` gives the pages the user's agent id instead.
- The Postgres migration is replaced by the MySQL one. Each SQL statement is capped at 30 seconds, as the template capped its service client's requests.
- `src/server/agent-ports.server.ts` gains two lint directives on its example stubs (their `Error` failures are the template's port contract).

## Open decisions before production

- The Docker image uses Node 18 and does not build the agent; the agent needs Node 22+, `npm ci --omit=dev` in `backend/agent` and `npm run build` (with dev dependencies) in the build stage.
- Legacy agent data: rows from before 2026-11-05 (`agent_users.data_owner_firebase_id IS NULL`) are kept and never served. `keepintax-dev` had none when the migration ran; production has no agent tables yet. Deleting such rows is a separate, explicit decision (the statement is in the migration's header).
- Local Langfuse requires its Docker stack to be running. Development evals use local tracing; see KT-089 for the runs actually executed, rather than treating configured keys as proof of exported traces.
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
| One conversation covers any of the data owner's businesses: switching the active business keeps the conversation, its history, search, stream, stop, steer, follow-ups, earlier results and memory. The business it started in is recorded, never changed | the gateway (no business filter), `claim_agent_chat_answer` |
| Memory belongs to the pair, across the owner's businesses (a person's preferences, not a business's data) | `agent_memories`, scoped by user only |
| A conversation id authorizes nothing: another pair's id reads as missing (stream 204, steer 409, chat 404, rename/delete no-op) | the gateway's scope on every statement |
| Switching client: a different pair, so the page's earlier agent user is refused (401 `USER_STATE_OWNER_CHANGED`) and the conversation id reads as missing; `/dev/agent` locks the chat and starts a new one. Switching business within the client keeps the chat | `createOwnedSupabaseClient`, `/dev/agent` |
| Revoked access: new requests are refused by the guard (403). An answer already running is checked again before every tool call and before each business of a multi-business query: its next read fails with `ACCESS_REVOKED`, a multi-business query returns nothing of what it read, and the next step tells the model to use nothing read earlier. Text the model already streamed before the revocation is not withdrawn | `AgentDomainService.assertAccessStillHolds` |
| Legacy rows (no data owner) are kept, never matched, never reassigned | `resolveAgentUserId` reads `data_owner_firebase_id = ?` |

## queryExpenses

Reads through `ExpensesService.getExpensesByUserID` as the data owner, for a range of expense dates (inclusive, at most 10 years), in:

- **one business** (`scope: "business"`): `businessNumber` when given (the agent fills in the conversation's business, "Business selection"), else the owner's only one; with several and none given it fails with `BUSINESS_REQUIRED`, listing them, and the model asks (or offers all). The page's `businessnumber` header is never a default;
- **several businesses** (`scope: "businesses"`): `businessNumbers` (2–20) or `allBusinesses: true`. Every number must be one of the owner's numbered businesses, or nothing is read (`BUSINESS_NOT_FOUND`). The same range and filters run in each business, and `combined` adds the subtotals (counted, pending, outside the books, excluded) in integer agorot. A business that fails is listed in `failed` with its code; then `complete` is false and `combined` is `null`, so a partial sum is never presented as the total. Example (keepintax-dev, fuel, Q1 2026): 111111118 ₪900 + 222222226 ₪1,200 = ₪2,100.

Each business's result separates:

- `totals`: APPROVED expenses booked to an account (`accountIdSnapshot` set), what the reports count (master plan D5/D6);
- `pending` (and `pendingByStatus`): PENDING, MISSING_ACCOUNTING_MAPPING, or no status;
- `approvedOutsideBooks`: APPROVED with no account, private expenses (D5), never in the business's reports;
- `excluded`: REJECTED or NOT_AN_EXPENSE (a count).

Amounts are ₪ with VAT included, summed in agorot, so groups (the 40 largest, the rest in `groupsOmitted`) add up to the totals exactly. Rows are at most 50 with `rowsOmitted`. Every search word must match (a second word never adds unrelated expenses); `filters` and `matchedClassifications` say what the numbers answer. A business without a number is never passed to the service (it would read every business). The instructions' `<books>` section tells the model to take every number from the tool, say the range, the business and what is not counted or left out, and leave tax decisions to the accountant.

## Books and reports reads (Phase 3)

`AgentBooksService` supplies nine reads through `KeepInTaxBooks`, bound to the verified actor/data-owner request. Each reads the owner's numbered businesses only and rechecks access before returning. The existing Firebase guard policy governs active delegations and admin access. A revocation during a read fails the whole result with `ACCESS_REVOKED`. `listUpcomingReports` can read all of that owner's businesses; the other new reads use the active/selected business. `queryExpenses` is unchanged.

| Tool | Existing source and meaning |
| --- | --- |
| `queryTransactions` | `TransactionProcessingService.getIncomesFromCache` / `getExpensesFromCache`, after the page's sync-state check; excluded cash-flow rows stay excluded. Money in/out is in recorded shekels, with signed detail rows. Unconverted and unlinked rows are excluded and counted. `bankData` reports the stored sync, not a live connection. A failed/partial sync or omitted data makes `complete` false. An unmatched account filter returns owned `accountsInRange` for a retry. |
| `queryIssuedDocuments` | `DocumentsService.getDocuments`, after the existing INVOICES module check. `count` counts matching issued documents; totals remain separate by document type **and currency**. Cancelled, draft and pending-allocation documents are excluded and counted separately. No document match does not establish whether a saved customer exists. |
| `listCategories` | `CatalogContextService.forUser` and `CatalogService.getMergedExpenseCatalog`: effective CLIENT/ACCOUNTANT/SYSTEM expense categories, private status and accounting-mapping readiness. This is the catalog, distinct from expenses waiting for review. |
| `listClients` | `ClientsService.getClients`: the selected business's saved customer contacts, distinct from accountant delegations. |
| `getProfitAndLoss` | `ReportsService.createPnLReportFromJournal`: income before VAT, tax-recognized expense sections and net profit before tax. No depreciation preparation runs; `depreciationMayBeMissing` warns that preparation may still be needed. Pending expenses are separate. |
| `getVatSummary` | `ReportsService.createVatReportFromJournal`: journal VAT-period figures, input VAT split between expenses/assets, VAT payable (negative means refund). Ranges expand to whole existing VAT periods; exempt/not-required businesses receive no VAT figures. |
| `getAdvanceTaxStatus` | `ReportsService.getAdvanceIncomeTaxReportData`, using its existing reporting-period behavior and configured advance percentage. Withholding is separate; National Insurance advances are not tracked. |
| `listUpcomingReports` | Pure `TasksGeneratorService.expectedReportPeriods` plus stored workflows and submission marks. It inserts no tasks/workflows. Without `businessNumber` it lists every owned business; `activeBusiness` is the conversation's business (filled in by the agent), else the only one, else null; never the page header. Only `queryExpenses` adds money across businesses. Due dates follow the generator's existing rule. Overdue means not marked as reported in KeepInTax, not proof of non-filing with the authority. |
| `getReportReadiness` | `ReportReviewService.getReportPreview(..., { readOnly: true })` and pending expenses. Inbox processing, pairing and matching are skipped. Foreign figures require recorded ILS conversion; otherwise the shekel amount is null and the original currency is retained. |

The new tools load through the deferred `books` and `reports` namespaces; `queryExpenses` remains loaded as before. Returned row/group/catalog lists are bounded, with omission counts. Totals cover all matching rows, not just the displayed portion. Reports preserve the existing builders' tax and accounting calculations; Phase 3 adds no schema or migrations.

Registry/context wiring is in `app-agent-tools.ts`, `agent-tool-search.ts`, `agent-tool-traits.ts`, `app-agent.ts` and the server domain/ports adapter.

The instructions require the business, period, currency/amount meaning and partial-data caveats. The deterministic answer check normalizes numeric formatting (grouping separators, trailing zeros and full date components) against successful books/report results of the **same turn**. It works without Jev and on Jev error/timeout. `AGENT_ANSWER_CHECK=false` retains the template's explicit off switch. Stop hooks can append a correction after streaming; they do not erase text already sent. Generic result paging is not book evidence: these books tools do not use the generic cut cache.

Thirty Hebrew eval cases live in `books/books-reads.eval.ts` and `reports/reports.eval.ts`, with fixed data in `agent-eval-books.ts` and `agent-eval-reports.ts`. Code checks tool/filter selection, expected figures and books-only numeric provenance; strict Jev judges check Hebrew, currency/content and invented records. Grader flags are retained and reviewed against the actual tool outputs. See KT-089 for executed batches, comparison caveats and remaining findings. Eval Git fingerprints hash untracked files by absolute paths so a nested package works on Windows; the dedicated runner regression tests that behavior.

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
| Evals (paid, bounded) | `npm run eval -- --variant <name> --reps 3 -t "books reads: transactions"`, or another small group (`books reads: issued documents`, `books reads: categories and clients`, `reports: profit and loss`, `reports: VAT`, etc.); use `--compare <prior-variant>` when applicable. Existing expense regressions are in `query-expenses.eval.ts` and `query-expenses-businesses.eval.ts`. Then inspect `.eval/agent/report/index.html` and the scoped results, not just the runner exit code. |

The integration tests need a throwaway MySQL 8 with both migrations applied, named by `AGENT_TEST_DATABASE_URL`; without it they are skipped. Never point it at a shared or production database. A local one, without Docker: unzip MySQL 8.0's Windows archive, `mysqld --initialize-insecure` into a scratch folder, run it on port 3307 with a small buffer pool, create `agent_test` and apply the two scripts.

## Langfuse

- **Development:** a self-hosted Langfuse on your machine. Run Langfuse's official compose file (`git clone https://github.com/langfuse/langfuse.git`, then `docker compose up` in it), open http://localhost:3000, create a project and put its keys in `backend/.env` with `LANGFUSE_BASE_URL=http://localhost:3100`. KeepInTax runs it on host port **3100** (3000 is the backend): `C:\Users\user\langfuse-local` holds the official compose file, an override publishing the web UI on 3100, and a git-ignored `.env` whose headless setup (`LANGFUSE_INIT_*`) creates the project `keepintax-agent-dev` and its keys on first start (`docker compose up -d` there; see its README). `backend/.env` then has `LANGFUSE_BASE_URL=http://localhost:3100`, `LANGFUSE_TRACING_ENVIRONMENT=development`, `LANGFUSE_SAMPLE_RATE=1` and the local keys. Evals trace only to a local Langfuse (`vitest.config.ts` samples 0 elsewhere). The server enforces the same: outside production, a non-local `LANGFUSE_BASE_URL` (including the default, the cloud) turns tracing off and logs `LANGFUSE_NOT_LOCAL`; `LANGFUSE_ALLOW_REMOTE=true` sends traces there on purpose.
- **Production:** Langfuse Cloud: the cloud project's keys, `LANGFUSE_BASE_URL=https://cloud.langfuse.com` and `LANGFUSE_TRACING_ENVIRONMENT=production` (required: without it nothing is traced).

## Adapting it to KeepInTax

Follow the template's list ([TEMPLATE-GUIDE.md](TEMPLATE-GUIDE.md), "How to adapt it to your product") once the agent spec is ready, with these KeepInTax rules:

- Domain tools read KeepInTax's data through ports whose real implementations call the existing Nest services' rules, never the database around them, and keep the backend's boundaries: the data owner and delegation scopes from the request (`AgentRequestIdentity`), reading versus proposing versus approving, and `EXPENSES_APPROVE` for any accounting decision. An action that changes money or books waits for an approval card (`agent-tool-traits.ts` "approval").
- Accounting meaning comes from `docs/redesign/categories-redesign-master-plan.md`; the agent never decides a booking rule.
- Hebrew is the users' language: the instructions' Hebrew section and `messages/he.json`.
- New tables go through a new SQL script under `backend/scripts/migrations/`, never `synchronize`.

## Phase 3.1: chat interaction (KT-108)

What a chat turn does now, beyond the table above:

- **Clarification.** The answer reads first; only a read that cannot run (`BUSINESS_REQUIRED`) leads to a question, with the business numbers as values. The page renders the stored part as buttons, so they survive a reload. A press continues the same assistant message: its range, search and the failed read stay in the turn, and the books answer check sees the new read in the same turn.
- **Reload, tabs, stale presses.** The lease admits one answer at a time (`409 AGENT_CHAT_BUSY`). Once a question is answered or superseded, any further press is `409 AGENT_QUESTION_CLOSED` and changes nothing; the page offers "Reload conversation".
- **Business switch and revoked access before a press.** The press names its business, so the chosen one is read whatever is active now (the port still checks ownership). A revoked delegation is refused by `FirebaseAuthGuard` before the agent (`agent-harness.access.spec.ts`).
- **Follow-ups.** Written from the capability list after the answer; the page fetches them on `data-followUpsPending` and shows the stored part after a reload, under the newest answer. A press is sent with `origin: "follow-up"` and writes nothing.
- **Dev page (`/dev/agent`).** Question buttons, live and stored follow-ups, the conversation in the URL (`?chat=`) with stream resume on reload, a recent-chats list, and the "saved" notice with undo (`deleteAgentMemory`).

## Business selection (2026-11-15)

The chat never takes the app's active business (the `businessnumber` header) as a default: it is whatever another screen left behind, hidden in the chat, and it made a question about one named business read another (`docs/research/assistant-qa-verification-2026-11-15.md` §8, S20). Code: `src/agent/tools/books/agent-conversation-business.ts`.

- **Directory.** Each turn the server reads the data owner's numbered businesses (`listBusinesses`, Nest `AgentDomainService.listBusinesses`, access-checked before and after) and gives them to the model in `<businesses>` (user context), with the conversation's business when there is one. Nothing comes from the page.
- **Resolution for a single-business read:** the `businessNumber` the model passes (a business the user named, from the directory), else the conversation's business, else the owner's only one, else `BUSINESS_REQUIRED` and the business buttons. The Nest side (`chooseBusiness`) no longer reads the header; non-chat endpoints still do, unchanged. The dev chat page no longer sends the header.
- **The conversation's business** is derived from the stored messages, so a reload keeps it: a user message naming exactly one business (server-written `data-businessContext`, matched by number or by the name's whole words, punctuation and Hebrew prefixes aside), a pressed business button, or an answer that read exactly one business by number. A read across businesses, the "all" button, two businesses in one answer or two named in one message clear it. A business no longer in the directory is dropped. The legacy `agent_chat_conversations.business_number` (the header the first request carried, never changed) is not read for it, and no schema changed.
- **Clarification.** `BUSINESS_REQUIRED`'s next step reads again with the named business when the user already named exactly one; otherwise it asks. An unnamed, unsettled question is never widened to all businesses.
- **Answer check.** When the user's message names exactly one business and every books read of the turn returned another, the answer is sent back (`agentAnswerBusinessViolations`). It only finds mismatches; wording that names no business, or several, is not judged.

## Planned interaction model (approved 2026-11-14; not implemented)

**Planned, not built.** Nothing in this section describes current code. The plan is [`docs/plans/ai-agent-tools-plan.md`](../../docs/plans/ai-agent-tools-plan.md), §1 A5.1 and A11–A25, and Phases 3.2, 4, 4.1, 5, 5.1 and 5.2. Phase 3.1's changes moved to "What KeepInTax changed, and why" above.

| Template today | Planned KeepInTax change | Plan |
| --- | --- | --- |
| Approval by effect and per-user action rules; Phase 3.1 adds only the not-offered denial and the follow-up write rule | Confirmation by consequence and by the turn's recorded origin; one setup card to create or resume a monitor; an opened notification cannot start ongoing work | A21, A25; Phase 3.2 |
| Free-text memory, all injected, `kind` held as a content prefix | Provenance columns (`kind`, `source`, `source_message_id`, `supersedes`); business facts moved to the business profile; a separate store of inferences that expire after 90 days, on by default with a switch that deletes them | A12, A20, A22, A23; Phases 4, 4.1 |
| Notifications for the template monitor only | An inbox of alerts and recommendations with deduplication, dismissal, a separate "not interested", expiry and opening into chat. Background actions only under a recorded standing authorization. No numerical cap on recommendations | A11, A14, A15, A24; Phases 5, 5.2 |
| Hidden template tools still registered | Their code is deleted once no stored conversation needs it, or after a migration of stored parts; tracking infrastructure returns as monitors over the books | A16, A17; Phases 1 (step 5), 5.1 |

## Local startup and background failure isolation (2026-11-14)

From this feature worktree run `start-ai.cmd` (PowerShell: `.\start-ai.cmd`). It starts only local Docker Desktop and the existing Langfuse stack, then verifies health. Start the frontend and backend manually. `--check` checks only Docker/Langfuse. See [local development](../../docs/operations/local-ai-development.md).

KeepInTax-specific resilience extensions to the template: `src/server/runtime/app-telemetry-errors.ts` contains optional exporter failures, bounds/reduces warnings, and observes detached promises without requiring a healthy app runtime for error reporting. Langfuse flush and shutdown failures do not fail a chat or disposal; each other exporter is isolated too. The Nest edge's `agent-background-context.ts` attributes late SDK rejections by async origin even when the error has only node:net frames. Other backend rejections remain fatal; required data errors are reported, not treated as successful work. This changes no authorization, accounting, schema or agent tool behavior.

## Phase A transaction classification (2026-11-17; mode update 2026-11-18)

The user approved delivering chat actions before profile/learning/monitors. This is a narrow part of Phase 6 with its required Phase 3.2 policy, not completion of either phase. See [the task record](../../docs/tasks/active/assistant-chat-classification.md).

- `queryTransactions` rows now include the stable `externalTransactionId`; `listCategories` includes each effective subcategory's `id`.
- `prepareTransactionClassification` (books namespace, read effect) prepares an outgoing, pending, account-linked, unlocked transaction in an owned business. Permanent merchant/account rule is the default; isSingleUpdate=true preselects one-time mode. It uses the effective catalog's booking-card percentages/recognition/equipment, never percentages chosen by the model. A private subcategory has zero defaults.
- The successful preparation stores a signed snapshot and display details in the assistant's tool part. The model sees only the display and a short `proposalId`; `classifyTransaction` accepts only that ID. On execution it resolves the original successful assistant result from this owned conversation. User parts, other chats, failed preparations and unknown IDs authorize nothing. The card may send only its one-time/permanent mode token as approval.reason; execution reads it from the exact authenticated stored approved toolCallId, never from model tool input or a replacement proposal.
- `classifyTransaction` always waits for its approval card, is serialized, and cannot run from a pressed follow-up. The dev page displays the original preparation's business/date/merchant/amount, before/after classification and accounting defaults, also after reload. Approval input cannot replace the stored proposal. Denial executes nothing.
- The Nest action rechecks identity, business, current delegated `EXPENSES_APPROVE` scope and OPEN_BANKING module. A represented owner can classify pending transactions, as on the existing page; one-time mode calls `classifyManually(..., true)` and never approves an expense. Permanent mode calls classifyWithRule with classificationOnly=true and explicit override after card approval. Confirmed or locked transactions and cross-business movement are refused.
- Execution uses transaction-scoped repositories and owner/cache/slim row locks. The proposal's state fingerprint and current catalog values must still match. A replay finding the same selected classification mode and, for permanent mode, the same rule returns `already_applied`, without another write. Existing period-lock checks still run in the domain service.
- Proposals expire after 30 minutes. The signing key is process-local: restart, deployment or a different backend instance invalidates an outstanding card safely, requiring a fresh proposal and approval. This local feature does not introduce a persistent signing key or schema migration; multi-instance delivery needs a shared signing-key design before rollout.

Scope excludes arbitrary batch actions, confirmed-transaction changes, expense approval, document linking and issuance. Those capabilities stay unavailable. No schema, production, provider or environment-file changes are required.

### Classification card orchestration follow-up (2026-11-17)

After a successful preparation in the current answer, prepareStep requires the next model step to call classifyTransaction with the prepared ID and offers only that tool. This creates the real approval request; it never executes or bypasses approval. Only classifyTransaction is eagerly loaded because the provider cannot force a namespaced deferred tool alone without tool_search. Other books tools remain deferred.

Preparation accepts optional requestApproval=false only for explicit proposal-only requests; omission means a card is required. A new user steer supersedes earlier preparations, and the boundary resets when the same agent starts another generation. Failed preparations, follow-up origins and already-attempted IDs do not force a card. This is a classification-specific transition, not a general orchestration framework.

Classification blocking errors identify the actual condition: already transferred to an Expense, submitted-report lock, missing account link, or incoming payment. confirmed means transferred to an Expense; the Expense may still await approval. Explain the returned reason instead of guessing a list of causes.

Both unclassified and classified outgoing transactions can receive a classification proposal while not transferred to an Expense. Existing category/subcategory is not a refusal reason. Read both states when locating a requested reclassification; server eligibility and a new approval card remain required.

### Classification mode on the approval card (2026-11-18)

The checkbox סיווג חד־פעמי is unchecked by default and checked for an explicit one-time request. It can change only the execution mode, not the signed business, transaction or catalog defaults. Permanent mode creates/updates the normal exact merchant + account rule, with no extra mode question. The card discloses replacing an existing rule or the focus transaction's one-time choice, future matching, and possible existing-row backfill from one calendar year before the focus date. Agent backfill is limited to this business and never changes confirmed/locked rows or other ONE_TIME classifications. Normal manual-rule matching remains unchanged. Rule snapshots prevent stale replacements; absence of conditions is matched with SQL IS NULL. No schema/environment change is needed. Old proposals without version 2 stay one-time and their checkbox cannot expand authorization.

### Approval cards after a clarification (2026-11-18)

An approval can continue only the newest assistant answer. A typed user message closes that answer's open approvals before the next answer starts; completed actions remain unchanged. Superseded is a system closure, distinguished from an explicit denial by the reserved approval reason. Reopening one through a stale submission returns AGENT_APPROVAL_SUPERSEDED (409) without running a model/action. The frontend also derives inactivity for older persisted requests immediately, including historical conversations from before server closure was implemented. It hides obsolete approve/deny controls, disables mode editing and offers a classification-specific fresh-card request. That request asks for current data and a new approval card, never treats typed text or the old click as approval.

### Empty conversation reads and initial dev UI (2026-11-18)

KeepInTax's dev page assigns a conversation UUID before its first saved message. Reading such a conversation returns [] after the existing owner-scoped query, without applying SDK nonempty-payload validation to an absent history. Nonempty histories retain full validation. The Angular dev page renders a loading body and editable draft immediately, enables sending only with a ready chat and discards obsolete asynchronous loads. Credential-free session/history timings appear as [dev-agent startup] in the dev console. These timings do not benchmark cold bundle initialization or model-answer latency. See the Phase A task record.

## Onboarding profile

The owner-only MySQL profile store lives in backend/src/agent-onboarding. `/agent/onboarding` uses the shared template chat runtime with an onboarding interface policy; ordinary chat uses the same canonical read/update tools without proactive profile questions. The optional readOnboardingContext callback supplies existing story and dated history. There is no environment activation flag; existing surface/owner authorization remains. See the one-agent section below and ../src/agent-onboarding/README.md for ownership, versioned writes, history and deletion limits.

## One agent, onboarding interface (2026-11-20)

`createAppAgent` composes one common harness with an optional server-bound onboarding policy. Both Angular chat surfaces use its normal streaming endpoint, stored conversation lifecycle and template Langfuse integration. The server stores the explicit owned business in `data-onboardingContext`; it rejects mode/business switches and rechecks owner-only access. No hidden business header is used.

`UserProfileMemory` is the host-supplied canonical personal/business memory port. `readUserProfile` is common/eager; `updateUserProfile` is normally deferred under `profile` to preserve the existing 20,000-character up-front budget. Onboarding keeps this tool eager and restricts both activeTools and toolApproval to profile and conversation-result reads. Source evidence comes from the server's current message (or validated steer), never an input field supplied by the model. The existing Nest store retains atomic versioned writes, temporal facts and deletion. Legacy generic business_fact writes fail rather than creating a competing profile; preference memory still works. Ordinary chat can act on explicit profile requests without starting onboarding questions. The summary is an ordinary turn in the same conversation. See `../src/agent-onboarding/README.md` for storage and verification. This supersedes the earlier dedicated extractor/tracing design and profile-edit redirect.

### Admin onboarding entry (2026-11-21)

The onboarding interface is launched only from the admin console. `authorizeOnboarding` is a host-bound callback that checks the actor's persisted ADMIN role before any profile read in that mode, including mode recovered from stored conversation history. Missing callback fails closed. Profile HTTP management has the same persisted-role guard; the normal app no longer mounts the invitation or menu link. Personal profile ownership/delegation checks and ordinary shared-agent memory behavior are unchanged.

## Automatic classification enqueue (2026-11-19)

The deferred books tool startAutomaticClassification takes scope=all and only enqueues the owner-authorized backend worker. It is a serialized write, cannot run from a suggested follow-up and is not safely rerunnable as a read. The backend requires standing consent; this tool never grants it. Queued is not completed. Progress and questions appear in Settings-new → הסוכן שלי. Individual chat classification still requires its original approval card and alone can select one-time mode. See ../../docs/features/assistant-auto-classification.md.

### Shared model configuration (2026-11-22)

The primary agent and automatic classifier both import KEEPINTAX_AGENT_MODEL_ID from ../src/agent-harness/agent-model.config.ts (gpt-6-luna). This pure shared module has no Nest imports and is bundled into the ESM agent, avoiding any new runtime cross-package dependency. The classifier uses the Responses API with strict JSON output, low reasoning and store:false. Its consent/evidence guards remain separate from model selection. No independent classifier model override.
