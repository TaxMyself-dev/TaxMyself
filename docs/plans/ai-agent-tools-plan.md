# KeepInTax AI agent: tools and delivery plan

Status: **PROPOSED, not approved.** Implemented so far (2026-11-05): the data scoping of 2.3 (as built, below) and the first books tool, `queryExpenses` (3.3), with the dev test page (A7). Everything else is not built.
Date: 2026-11-03; updated 2026-11-05.
Inputs:
- the capability spec, `backend/src/AI.features.md`;
- the agent package, `backend/agent` (KT-089, ported 1:1 from the agent template);
- the template's own guide, `backend/agent/TEMPLATE-GUIDE.md`.

This plan lists every tool, job and screen the spec needs, in the order to build them, with the tests that prove each one. Domain mechanics (classification rules, forecasts, thresholds, document-type rules) are supplied later by the product owner. Until then, the tools that depend on them are built with a pluggable rule module and marked **RULES PENDING**.

## 1. Decisions already made

| # | Decision | Source |
|---|---|---|
| A1 | Build on the agent template's harness and do it the template's way: tools with effect traits, ports, deferred namespaces, skills, memory, the tracking-task worker, evals and harnessing. | user |
| A2 | Stack: AI SDK 7, gpt-6-luna, Effect 4, Jev (TypeSafe), DeepEval, vitest and Langfuse. Langfuse is self-hosted (Docker) in development and Langfuse Cloud in production. | user |
| A3 | The email connection goes through **Composio**, behind an `EmailSource` port so another provider (Maton) can be added later. | user |
| A4 | Documents found in email are linked to transactions **automatically**, and the user is told afterwards ("act, then report"). Linking is reversible (unpair), and the expense itself still needs the user's approval. | user |
| A5 | For an accountant, the agent's data (chats, memory, tasks, profile notes) belongs to the pair **(actor, client)**. The accountant's views across all clients are a separate scope of their own. | user |
| A6 | The business profile lives in a **new table** (free text plus extracted facts, one row per business). Long-term memory holds only the person's preferences and their way of working. | user, on the plan's recommendation |
| A7 | The visual test UI is a **dev-only Angular page** in the existing app, with real Firebase login against the real `/api/agent`. It is not the final UI, which waits for its own spec. | user |
| A8 | The agent's SQL scripts may be applied to **keepintax-dev**. Production is touched only at release, by hand. | user |
| A9 | Any action that changes the books, money or an official document waits for an **approval card**, and it also requires the backend's existing permission (`EXPENSES_APPROVE` or the relevant scope). | repository rule (`backend/agent/GUIDE.md`) |
| A10 | Accounting meaning comes from `docs/redesign/categories-redesign-master-plan.md`. Decisions D1–D15 there are final, and the agent never invents a booking rule. | root `AGENTS.md` |

## 2. Architecture additions

### 2.1 The domain bridge (ports)

The agent package is ESM and cannot use Nest's dependency injection. The template's port pattern bridges the two:

```
backend/agent/src/agent/core/ports/keepintax-ports.ts   (interfaces only, Effect-returning)
          ▲ carried in the tool context (agent-tool-context.ts)
          │
backend/src/agent-harness/agent-domain-ports.service.ts (Nest: real implementations)
          │ calls the existing services (expenses, transactions, documents, reports,
          │ feezback, report-workflow, accountant-tasks, delegation, business, clients,
          │ annual-report, document-import) — never the repositories directly
          ▼
handleAgentHttpRequest(request, user, ports)             (the bundle's entry gains `ports`)
```

- Every port method receives the request's **AgentRequestIdentity**: the actor, the data owner, the business, the delegation scopes, and whether this is an admin impersonation. It enforces the same checks the matching controller enforces. The agent can never reach data the user couldn't reach through the app.
- `businessNumber` is validated against the owner's businesses inside the port. The current gap (a header the guard does not check, noted in `GUIDE.md`) closes here.
- The evals and unit tests use **fake ports** (`tests/evals/agent/harness`), so no eval touches a real database or service.
- The template's example ports (`WebSearch` and `EmailSender`) and example tools (`searchWeb` and `sendEmail`) are removed once the first real tools land.

### 2.2 Background jobs

The template's tracking-task worker (`dist/task-worker.mjs`, a separate process) cannot use Nest services. Plan:

- Run the worker loop **inside the Nest process** through a small Nest provider (`AgentWorkerService`). It starts the bundle's worker entry with the same ports, and an env switch (`AGENT_WORKER=on|off`) turns it on or off.
- The jobs are rows in the template's task tables, so claiming, leases, fencing and `SKIP LOCKED` are all reused. Each job type registers a handler.

| Job | Schedule | Capability |
|---|---|---|
| `email-import` | every N minutes per connected inbox | user 3 |
| `bank-connection-watch` | daily | the "bank connection" paragraph |
| `advance-tax-watch` | weekly or monthly | user 6 |
| `report-deadline-reminders` | daily | user 8 |
| `accountant-daily-prep` | daily, at the accountant's chosen hour | accountant 2 |
| `accountant-morning-brief` | daily | accountant 1 |
| `accountant-portfolio-review` | weekly (frequency to be set) | accountant 3 |

- What a job finds reaches the user as a **notification** in the template's notification table and as an opportunity on the matching tracking task, which a chat can then pick up ("I found an invoice and linked it").
- The template's **user-defined** tracking tasks ("watch X for me") stay available. Whether to expose them in the KeepInTax UI is a UI-spec decision.

### 2.3 Data scoping (A5)

- New columns `data_owner_user_id` (and `business_number` where it matters) on `agent_conversations`, `agent_memories`, `agent_tracking_tasks` and `agent_notifications`. They go in a new dated SQL script, and the gateway's table registry (`mysql-agent-tables.ts`) is updated to match.
- The gateway's row filters become (actor = me **and** owner = the request's data owner). A regular user's actor and owner are the same person, so nothing changes for them.
- Accountant scope: the accountant's own cross-client chats use `owner = actor` and reach clients only through the accountant tools. Those tools list clients from `delegation.getUsersForAgent` and check the scope on each call.

**As built (2026-11-05, `2026-11-05_agent_actor_owner_scope.sql`):** instead of an owner column on each table, `agent_users` itself is keyed by (actor, data owner), so every agent table (conversations, messages, stream, steers, documents, memory, settings, usage, tasks, notifications) is scoped to the pair with no change of its own. `agent_chat_conversations.business_number` binds a conversation to the business it started in; the gateway reaches a conversation and its content only from that business, while memory stays with the pair. Legacy rows keep a NULL owner and are never served. Details: `backend/agent/GUIDE.md`, "Isolation".

### 2.4 The business profile (A6)

The `agent_business_profiles` table (new SQL script):

| Column | Meaning |
|---|---|
| `id` CHAR(36) | |
| `owner_user_id` | KeepInTax user (Firebase uid), the data owner |
| `business_number` | one profile per business; a spouse's business has its own |
| `summary` TEXT | the profile in the user's own words; freestyle, any length |
| `facts` JSON | `[{"topic":"home_office","text":"…","since":"2026-03","source":"chat:<id>"}]`. Topics are free strings; the rule modules read the ones they know |
| `onboarding_status` | `not_started`, `in_progress`, `done` or `dismissed` |
| `created_at`, `updated_at` DATETIME(6) | |

- Who sees it: the owner sees it, and so does an accountant with a delegation that covers the business.
- `readAgentSession` gains `needsOnboarding`, which drives the pop-up (user 1).

## 3. Tool catalog

Effects follow `agent-tool-traits.ts`:
- **read**: reads the user's data, changes nothing.
- **ui**: shows something in the chat.
- **external**: a read from an outside service.
- **write**: changes the user's data.
- **approval**: waits for the user's approval card.

The namespace column says which tools load on demand through tool search; "core" means always loaded.

### 3.1 Core and conversation (template, kept)

These keep their template behavior:

`askUserQuestion`, `updatePlan`, `saveAgentMemory` / `updateAgentMemory` / `forgetAgentMemories`, `readAttachedDocument`, `readToolResultItems`, `searchEarlierResults`, `readAppKnowledge`, `loadAgentSkill`, `setAgentActionRule`, `updateUserSettings` and `toolSearch`.

`readAppKnowledge` is rewritten with KeepInTax's own help content: the screens, what each report is, how open banking works, and where to upload documents.

### 3.2 Business profile — namespace `profile`

| Tool | Effect | Backed by | Capability |
|---|---|---|---|
| `readBusinessProfile` | read | new `agent_business_profiles` table, plus `business.getUserBusinesses` (business type, VAT status) | user 1, 9 |
| `updateBusinessProfile` | write | the same table; it records the chat as the facts' source | user 1, 9 |
| `setOnboardingStatus` | write | the same table | user 1 |

The `keepintax-onboarding` skill replaces the template's `new-user-setup`. It is the onboarding conversation: what the business does, working from home, car use and other facts. **RULES PENDING**: the product owner supplies the question list.

### 3.3 Books Q&A — namespace `books` (read-only)

| Tool | Effect | Backed by | Capability |
|---|---|---|---|
| `queryExpenses` | read | `expenses.getExpensesByDates`, `getExpensesBySupplier`, `getUserCategoriesGrouped`; filters by period, category, sub-category or supplier; returns totals and rows | user 4 |
| `queryTransactions` | read | `transactions.getTransactionsByUserID`, `getSources`; filters by period, account, merchant, direction or classification state | user 4 |
| `queryIssuedDocuments` | read | `documents.getDocuments`, `clients.getClients`; by client, period or type | user 4 |
| `listCategories` | read | `expenses.getUserCategoriesGrouped` | user 2, 4 |
| `listClients` (the user's customers) | read | `clients.getClients` | user 4, 5 |

### 3.4 Reports — namespace `reports` (read-only)

| Tool | Effect | Backed by | Capability |
|---|---|---|---|
| `getProfitAndLoss` | read | `reports.createPnLReportFromJournal` | user 4, 6 |
| `getVatSummary` | read | `reports.createVatReportFromJournal` | user 4, 8 |
| `getAdvanceTaxStatus` | read | `reports.getAdvanceIncomeTaxReportData` | user 6 |
| `listUpcomingReports` | read | `report-workflow.listForClient`, `reports.getReportSubmissionStatus`, `shared` VAT-period math | user 8 |
| `getReportReadiness` | read | `report-review.getReportPreview`: missing documents and unapproved rows for a period | user 7, 8 |

### 3.5 Banking — namespace `banking`

| Tool | Effect | Backed by | Capability |
|---|---|---|---|
| `getBankConnectionStatus` | read | `feezback.getUserConsents`, `getUserSyncState`, `user-sync-state.service` | user 2, bank |
| `createBankConnectionLink` | external | `feezback.createConsentLink` | user 2, bank |
| `listTransactionsToClassify` | read | `transactions.getTransactionToClassify` | user 2 |
| `suggestClassifications` | read | **RULES PENDING**: a rule module combines the profile facts, the categories and the merchant history (`transactions.getDistinctMerchants`), and returns suggestions with a reason. It changes nothing. | user 2 |
| `classifyTransactions` (batch) | approval | `transactions.quickClassify` / `saveTransactionsToExpenses`; the card lists every row and its category, and the user can untick rows | user 2 |

### 3.6 Email documents — namespace `email` (Composio)

| Tool | Effect | Backed by | Capability |
|---|---|---|---|
| `connectEmailInbox` | external | new `EmailSource` port, Composio: start a connection for the Gmail or Outlook toolkit and return its auth link | user 3 |
| `getEmailConnectionStatus` | read | Composio connected accounts, plus the agent's own record of each inbox | user 3 |
| `listImportedEmailDocuments` | read | what the `email-import` job did: imported, linked, needs attention | user 3 |
| `disconnectEmailInbox` | approval | Composio: revoke the connected account | user 3 |

The **`email-import` job** does the work in the background:
1. Search the inbox for invoices and receipts since the last run (Composio search).
2. Fetch the attachments.
3. De-duplicate (message id plus file hash).
4. Pass each file through `document-import.importDocument`, which uploads it to Drive and runs OCR through `documents.uploadAndOcrDoc`.
5. Match it to a transaction (`reports/matching.service`), then link it (`report-review.linkDocToTx`, per A4).
6. Notify the user.

Unmatched documents stay in the review queue.

Open: the existing Gmail OAuth integration (`backend/src/integrations`) stays as it is until the product owner decides whether Composio replaces it.

### 3.7 Missing items — namespace `review`

| Tool | Effect | Backed by | Capability |
|---|---|---|---|
| `listMissingItems` | read | `report-review.getReportPreview`: payments without a document, documents without a payment, unclassified rows | user 7, 8 |
| `attachDocumentToTransaction` | write | `report-review.uploadDocAndLinkToTx`; the file comes from the chat's attachments (template `attached-document-tools`) | user 7 |
| `markTransactionPrivate` / `markTransactionBusiness` | approval | `report-review.rejectTx` / the classification path; the user's answer to "business or private?" | user 7 |
| `unlinkDocument` | write | `report-review.unpair`, the undo for A4 | user 3, 7 |

### 3.8 Income documents — namespace `income`

| Tool | Effect | Backed by | Capability |
|---|---|---|---|
| `listUnmatchedIncome` | read | `transactions.getIncomesTransactions` without a linked issued document | user 5 |
| `findLikelyClient` | read | `clients.getClients` plus earlier documents to the same payer (`documents.getDocuments`) | user 5 |
| `draftIncomeDocument` | write | `documents.setInitialDocDetails`, `saveDraft`, `previewDoc`; the document type comes from a rule module, **RULES PENDING** (business type, transaction kind); returns a preview card | user 5 |
| `issueIncomeDocument` | approval | `documents.createDoc`, with SHAAM allocation where the rules require it (`shaam`); the card shows the PDF preview | user 5 |
| `discardIncomeDraft` | write | `documents.deleteDraft` | user 5 |

### 3.9 Accountant — namespace `accountant`

These are available only when the actor is an accountant, and every call checks the delegation scope for that client.

| Tool | Effect | Backed by | Capability |
|---|---|---|---|
| `listMyClients` | read | `delegation.getUsersForAgent` | acc 1 |
| `listAccountantTasks` | read | `accountant-tasks.list` | acc 1 |
| `createAccountantTask` / `updateAccountantTask` | write | `accountant-tasks.create` / `update` | acc 1 |
| `listReportObligations` | read | `report-workflow` for each client: what was filed, what remains | acc 1 |
| `getWorkQueue` | read | tasks, obligations and deadlines merged into one prioritized queue; the morning brief is this queue | acc 1 |
| `markReportSubmitted` | approval | `report-workflow.setReported` / `reports.markReportAsSubmitted` | acc 1 |
| `getClientPrepStatus` | read | the result of the `accountant-daily-prep` job for each client: documents gathered, drafts ready, what is missing | acc 2 |
| `runClientPrepNow` | write | queues that job for one client | acc 2 |
| `getClientSummary` | read | P&L, VAT and advance tax for one client (the `reports` tools under the client's scope) | acc 1, 3 |
| `listPortfolioFlags` | read | the result of `accountant-portfolio-review`: which clients need a look, and why. **RULES PENDING**: thresholds and forecast | acc 3 |

The `accountant-daily-prep` job collects from:
- the user's uploads;
- email (Composio);
- Drive (`integrations/gmail-drive-import`, `google-drive`);
- **WhatsApp**: a new integration, deferred until a provider is chosen.

It then builds the VAT drafts (`reports`) and the annual-report drafts (`annual-report.getOrCreate`). It never approves or files anything, per the spec.

### 3.10 Removed from the template

`searchWeb`, `sendEmail` and their ports (examples only), and the template's `research-brief` example skill.

## 4. Phases

Every phase finishes with the same gate:
- typecheck, lint and format for the agent package;
- the Nest build;
- the agent's vitest suite and the backend Jest suite (single process on this machine);
- the new evals, run with repetitions, compared with the previous run;
- a local commit.

Each phase is one task file under `docs/tasks/active/` (KT-090 onward).

### Phase 0 — Environment and baseline

1. Local Langfuse: Langfuse's official docker compose, then a `keepintax-agent-dev` project, with its keys in `backend/.env`.
2. Keys in `backend/.env`: `OPENAI_API_KEY`, `TYPESAFE_API_KEY`, `COMPOSIO_API_KEY`, `AGENT_APP_ORIGINS=http://localhost:4200`.
3. Apply `2026-10-22_agent_harness_schema.sql` to keepintax-dev (A8), and point `AGENT_TEST_DATABASE_URL` at a throwaway local MySQL.
4. Fix the template's 11 stale tests so the agent suite is green, without changing behavior.
5. Run the template's own evals once (`--variant template-baseline --reps 3`), and check the traces in Langfuse.
6. Smoke test: start Nest with the bundle, send one chat over HTTP, and confirm the streamed answer and the trace.

**Done when:** the suites are green, the baseline eval report exists, and a trace shows up in local Langfuse.

### Phase 1 — Domain bridge and scoping

1. `keepintax-ports.ts` holds the interfaces for every port in section 3, grouped by namespace. `agent-tool-context.ts` carries them.
2. `AgentDomainPortsService` (Nest) implements them, with the identity checks from §2.1. `handleAgentHttpRequest` gains the `ports` argument.
3. The fake ports (eval harness) come with fixed KeepInTax data: two businesses, a bank account and a card, fifty transactions, a few documents, one accountant with three clients, all in Hebrew.
4. Scoping migration (§2.3): the SQL script, the registry update and the gateway filters.
5. Remove the example tools and ports. Register the namespaces.

**Tests:**
- Jest specs for each port method: owner, delegated read and write scopes, a forbidden client, and an impersonating admin.
- Gateway integration tests: an accountant's chat for client A never reaches client B.

**Done when:** the template's evals still pass at the baseline rate with the examples removed.

### Phase 2 — Angular dev page (visual testing)

1. A `/dev/agent` route, shown only when `environment.agentDevPage` is on (dev only), and guarded by the existing auth guard.
2. A chat that streams `POST /api/agent/chat` with the Firebase token, through the existing auth interceptor.
3. It shows tool calls, tool results (as JSON, folded), approval cards (approve or reject), `askUserQuestion` choices, and plan updates.
4. It resumes a running answer (`GET chats/:id/stream`), and has stop and steer buttons.
5. A side panel lists the chats, memories, notifications, the business profile, and the data owner the request runs as.
6. A link to each turn's Langfuse trace.

**Tests:** an Angular unit test for the stream parser, plus a manual check-list in the task file.

**Done when:** you can chat, approve, reject and see the trace for any tool built so far.

### Phase 3 — Books and reports Q&A (§3.3, §3.4)

1. Tools, port implementations, and the system prompt's Hebrew section on reading numbers: always quote the period, never invent a number, and say when the data is partial.
2. An answer-check rule: every number in an answer must come from a tool result in the same turn (template answer check).

**Evals:**
- About 30 Hebrew questions, among them "כמה הוצאתי על דלק השנה?", "כמה אני מוציא על פלאפון?" and "האם הוצאתי חשבונית ללקוח X?", plus period edge cases (VAT bi-monthly, a year boundary).
- Judges check four things: the right tool and filters were used, the numbers match the fake data, the answer is in Hebrew, and nothing was invented.

### Phase 4 — Business profile and onboarding (§3.2)

1. The SQL script, the registry, and the profile ports and tools.
2. `needsOnboarding` in `readAgentSession`.
3. The `keepintax-onboarding` skill, as a draft question list to be replaced by the product owner's.
4. The memory rules: preferences go to memory, business facts go to the profile, and never both.

**Evals:**
- The onboarding conversation fills the profile.
- A later "I started working from home" updates the facts.
- Facts are never invented.
- A spouse business gets its own profile.

### Phase 5 — Background jobs engine (§2.2)

1. `AgentWorkerService` inside Nest, the `AGENT_WORKER` switch, the job registry and per-job handlers.
2. Notifications to the user, and a list of them on the dev page.

**Tests:**
- Integration tests against MySQL: claim, lease, a crash before completion, a retry, two workers.
- Jest specs for the provider's start and stop.

### Phase 6 — Banking and classification (§3.5)

1. Status, link and the list to classify.
2. `suggestClassifications`, with a placeholder rule module: it uses only the merchant history and the categories until the product owner's rules arrive.
3. `classifyTransactions` with a batch approval card.
4. The `bank-connection-watch` job: an expired consent produces a notification and a reconnect link in chat.

**Evals:**
- Suggestions always carry a reason.
- Nothing is classified without the card.
- A rejected card changes nothing.
- A disconnected bank produces a reconnect prompt, never a promise that the accountant will fix it.

### Phase 7 — Email documents through Composio (§3.6)

1. The `EmailSource` port and its Composio implementation: connection, search and attachment download.
2. The connect, status, list and disconnect tools.
3. The `email-import` job: de-duplicate, import, OCR, match, link (A4), then notify.

**Tests:**
- Composio stubbed at HTTP level in the unit tests.
- One manual end-to-end run on a test Gmail inbox.

**Evals:**
- The report wording ("מצאתי חשבונית במייל…").
- A document that matches no transaction is never linked.
- Undo through `unlinkDocument`.

### Phase 8 — Missing items and report deadlines (§3.7, `listUpcomingReports`, `getReportReadiness`)

1. The tools.
2. The `report-deadline-reminders` job, which sends one reminder listing what is missing and what needs approval.

**Evals:**
- A "business or private?" question, followed by the approval.
- Uploading a missing invoice from the chat.
- A reminder lists only real gaps.

### Phase 9 — Income documents (§3.8)

1. The tools.
2. The document-type rule module, **RULES PENDING**: the placeholder issues nothing without an explicit type chosen by the user.
3. The preview card, and an approval card that shows the PDF.

**Tests:** Jest specs proving `issueIncomeDocument` cannot run without approval and the backend permission. Document indexes are reserved only after approval (`documents.rollbackDocumentAndIndexes` on failure).

**Evals:**
- An exempt business versus a licensed one.
- An existing client is recognized.
- Without approval, no document is issued.

### Phase 10 — Advance-payment alerts (`getAdvanceTaxStatus`, `advance-tax-watch`)

1. The data the backend has today: income tax advances (`getAdvanceIncomeTaxReportData`).
2. National Insurance: **there is no data in the backend.** The product owner chooses the source (a profile fact, a new field, or a new module).
3. The forecast and the alert thresholds, **RULES PENDING**: built as a rule module and tested with tables of numbers.

**Evals:** the alert explains the gap, suggests checking it with the accountant, and never changes the advances itself.

### Phase 11 — Accountant tools and jobs (§3.9)

1. Client list, tasks, obligations and the work queue, then `markReportSubmitted`, which needs approval.
2. The jobs: `accountant-morning-brief`, `accountant-daily-prep` (uploads, email, Drive; WhatsApp deferred) and `accountant-portfolio-review` (**RULES PENDING**).
3. The accountant's preferred hour, stored in the template's user settings.

**Tests:** Jest specs for the delegation scope on every port. A client the accountant lost access to disappears from every tool and job.

**Evals:**
- The morning brief is prioritized correctly.
- Drafts are never approved by the agent.
- The cross-client review gives reasons for each flag.
- There is no leak between clients (A5).

### Phase 12 — Quality loop

1. A full eval run across every namespace (`--reps 3`), with train and test splits and the HTML report.
2. Trace mining: real dev chats from Langfuse become new eval cases (template `traces/`).
3. Harnessing: the template's prompt proposer on the weakest criteria, keeping only changes that hold on the test split.
4. The latency and cost budget for each turn, from Langfuse's usage numbers.

### Phase 13 — Production readiness (only with the product owner's go-ahead)

1. Docker: Node 24 in the backend image, and the agent package built in the build stage (`GUIDE.md` open decision).
2. Langfuse Cloud keys and `LANGFUSE_TRACING_ENVIRONMENT=production`.
3. Every agent SQL script collected for the production release (the repository's manual release process).
4. Deleting an account cascades to the agent's tables (`agent_users` linked to KeepInTax users).
5. A security review: ports versus controllers' permissions, prompt injection from email content (an email's text is data and never an instruction), and Composio token handling.
6. Monitoring: AI cost per user, the job failure rate, and alerts.

## 5. Inputs needed from the product owner

| For | What | Blocks |
|---|---|---|
| Phase 4 | The onboarding question list, and which profile facts matter for which rights and obligations | the onboarding skill's final content |
| Phase 6 | The classification rules: what counts as a business expense per profile (car, home office, phone and so on), and the deduction percentages if relevant | `suggestClassifications` beyond merchant history |
| Phase 7 | Composio account and API key; which inbox providers (Gmail and Outlook?); how often to scan | the real email connection |
| Phase 9 | Which document to issue for each business type and transaction kind; when SHAAM allocation applies | `draftIncomeDocument`'s type choice |
| Phase 10 | The forecast method and alert thresholds; the National Insurance data source | the alerts |
| Phase 11 | Prioritization rules for the work queue; the cross-client thresholds and frequency; the WhatsApp provider | the accountant jobs |
| Any | Whether Composio replaces the existing Gmail OAuth integration | cleanup of `backend/src/integrations` |

## 6. Testing strategy (every tool)

| Layer | Tool | What it proves |
|---|---|---|
| Unit (vitest, agent) | each tool | input schema, its effect trait, its namespace, and mapping to the port |
| Unit (Jest, Nest) | each port method | the same permission checks as the app: owner, delegation scope, impersonation, business ownership |
| Integration (vitest and MySQL) | gateway, jobs | scoping (A5), job claims and leases, and the profile table |
| Evals (DeepEval and Jev judges, fake ports) | each capability | tool choice, arguments, numbers that match the data, Hebrew, approval before every action, no invention; repetitions with Wilson intervals |
| Traces (local Langfuse) | every dev chat and eval | what the model saw and did; the source of new eval cases |
| Manual (dev page) | each phase | the visual check-list in the task file |

Paid runs (evals and harnessing) use small batches: 3 repetitions per case, run per phase, never in a loop without a cap.
