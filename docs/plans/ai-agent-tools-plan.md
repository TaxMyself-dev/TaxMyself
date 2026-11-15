# KeepInTax AI agent: tools and delivery plan

Status: **PROPOSED, not approved** as a whole. Implemented so far: the data scoping of 2.3 (as built, below) and the first books tool, `queryExpenses` (3.3), for one or several of the owner's businesses, with the dev test page (A7) (2026-11-05); and **Phase 3** (2026-11-11, KT-089): the rest of §3.3 and §3.4 as read-only tools (`queryTransactions`, `queryIssuedDocuments`, `listCategories`, `listClients`, `getProfitAndLoss`, `getVatSummary`, `getAdvanceTaxStatus`, `listUpcomingReports`, `getReportReadiness`), the Hebrew prompt on number origins, and the same-turn number check. Where Phase 3 deviates from the tables below, see "Phase 3 as built" under §3.4. **Phase 3.1** (2026-11-15, KT-108): the chat interaction corrections, as recorded under Phase 3.1 ("Status"). Everything else (Phases 3.2 and 4–13, including Phase 8's reminder job and Phase 10's alerts) is not built.
Date: 2026-11-03; updated 2026-11-11; updated 2026-11-14 (the interaction model, §2.5–§2.10, Phases 3.1, 3.2, 4.1, 5.1 and 5.2, §6.1, §7 and the appendices were consolidated into this plan as **proposed, not built and not approved**; the separate proposal `ai-agent-interaction-model-plan.md` is now a pointer to this file); updated 2026-11-15 (the product owner's decisions of 2026-11-14 on DR-1 to DR-14 recorded as approved, §1 A11–A25, and propagated through the plan).

This is the single plan for the agent. The decisions in §7 were **approved on 2026-11-14** (§1, A11–A25). Approval is not implementation: everything they govern is still **not built** unless the build-status table below says otherwise, and the plan as a whole stays PROPOSED. Blockers that remain are of other kinds: RULES PENDING, missing credentials or providers, and phases not yet built.

**Build status by phase** (from code at `new-ai-assistant` @ `8ffde33a`, read on 2026-11-14 without running it; verification evidence lives in `docs/tasks/active/KT-089-agent-harness-backend.md` and was not re-run for this update. Rows 2 and 3.1 updated 2026-11-15 from KT-108, whose verification is in `docs/tasks/active/KT-108-agent-chat-interaction.md`):

| Phase | State | Notes |
|---|---|---|
| 0 | Recorded as done in KT-089 | Langfuse runs locally through `start-ai.cmd` (`backend/agent/GUIDE.md`, 2026-11-14) |
| 1 | Partly built | Data scoping is done (§2.3, as built). Books and reports reads go through `KeepInTaxBooks`, backed by `AgentDomainService` and `AgentBooksService`, not a single `AgentDomainPortsService`. Step 5 is open: the example tools (`searchWeb`, `sendEmail`) and their ports are still registered |
| 2 | Partly built | `/dev/agent` streams the chat and shows tool calls as JSON, approval cards and stop. Since KT-108 (2026-11-15): `askUserQuestion` buttons from the stored part, follow-ups fetched live and shown after a reload, the conversation in the URL with its stream resumed on reload, a recent-chats list, the "saved" notice with undo, and unit specs for the page's helpers (`dev-agent-chat.spec.ts`; the page uses the AI SDK's own stream parser). Not built: steer, the side panel (memories, notifications), a link to each turn's trace. Not runtime-verified in a browser (KT-108) |
| 3 | Built (KT-089, 2026-11-11) | See "Phase 3 as built" under §3.4 and KT-089's evaluation status |
| 3.1 | Built (KT-108, 2026-11-15) | See Phase 3.1, "Status". Remaining gaps listed there |
| 3.2–13 | Not built | Phases 3.2, 4.1, 5.1 and 5.2 are new (2026-11-14). Their decisions are approved (A11–A25); none of that work is implemented |
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
| A5.1 | Amendment to A5 (DR-3, 2026-11-14): "profile notes" in A5 means an accountant's **private** notes about a client, which stay with the pair. Business facts in the business profile (§2.4) are shared per business under the delegation permissions, with the actor recorded on each fact. | user (DR-3) |
| A6 | The business profile lives in a **new table** (free text plus extracted facts, one row per business). Long-term memory holds only the person's preferences and their way of working. | user, on the plan's recommendation |
| A7 | The visual test UI is a **dev-only Angular page** in the existing app, with real Firebase login against the real `/api/agent`. It is not the final UI, which waits for its own spec. | user |
| A8 | The agent's SQL scripts may be applied to **keepintax-dev**. Production is touched only at release, by hand. | user |
| A9 | Any action that changes the books, money or an official document waits for an **approval card**, and it also requires the backend's existing permission (`EXPENSES_APPROVE` or the relevant scope). | repository rule (`backend/agent/GUIDE.md`) |
| A10 | Accounting meaning comes from `docs/redesign/categories-redesign-master-plan.md`. Decisions D1–D15 there are final, and the agent never invents a booking rule. | root `AGENTS.md` |
| A11 | **Background actions (DR-1).** A background run acts only under a recorded standing authorization, only with reversible actions, and reports what it did; anything else becomes a proposed action in a notification. Connecting an inbox is the standing authorization for A4's automatic import and linking for that inbox. Expense approval stays separate. | user, 2026-11-14 |
| A12 | **Business facts and personal memory (DR-2).** A6 stands: personal preferences go to memory, business facts to the business profile. Before the profile exists, a business fact the user states is held in memory explicitly marked `kind: business_fact`, and moved to the profile when it is built; it is never kept in both. | user, 2026-11-14 |
| A13 | **Visibility (DR-3).** See A5.1: business facts are shared under delegation; personal memory, inferences, chats and an accountant's private notes stay with the (actor, client) pair. | user, 2026-11-14 |
| A14 | **Background reads (DR-4).** Product-defined jobs (§2.2) and product-defined recommendation jobs are authorized at product level, subject to the user's notification preferences and an opt-out. A user's own monitors are authorized one by one. Both stay within A5 and the access checks. | user, 2026-11-14 |
| A15 | **Dismissal (DR-5).** Dismissing an item silences that item's key for its period and does not reject the inference behind it; a separate "not interested" action rejects the inference. | user, 2026-11-14 |
| A16 | **Template example tools (DR-6a).** `searchWeb` and `sendEmail` are no longer offered to the model. Their code stays until no stored conversation needs it, or until a migration of stored parts. The planned Composio email-document tools (§3.6) are unaffected. | user, 2026-11-14 |
| A17 | **Template tracking tools (DR-6b).** The template's web-only tracking, suggestion and opportunity tools are hidden from chat; their infrastructure (tasks, worker, leases, notifications) is kept for the books monitors of Phase 5.1. | user, 2026-11-14 |
| A18 | **Clarification (DR-7).** `askUserQuestion` is answered by the page, validated by the server, and continues the same turn (§2.6). This deviation from the template is listed in `backend/agent/GUIDE.md`. | user, 2026-11-14 |
| A19 | **Onboarding (DR-8).** Onboarding is optional and started by the user (an entry or a notification they open); it never interrupts an ordinary chat request. | user, 2026-11-14 |
| A20 | **Stable facts (DR-9).** A stable fact the user explicitly states may be saved without a separate "remember" request, with a visible "saved" notice and an undo; an uncertain interpretation stays an inference. | user, 2026-11-14 |
| A21 | **Monitors (DR-10).** Creating or resuming a monitor takes one setup confirmation card with the resolved parameters; pausing and stopping do not. | user, 2026-11-14 |
| A22 | **Learning (DR-11).** Learning from interactions is on by default, visible to the user, with a switch that turns it off and deletes what was inferred. | user, 2026-11-14 |
| A23 | **Inference retention (DR-12).** An inference expires after 90 days without new evidence; a rejection keeps only a topic suppression key. | user, 2026-11-14 |
| A24 | **Recommendation volume (DR-13).** No numerical cap on recommendations, and no configurable cap in its place. Relevance filtering, deduplication, dismissal and expiry stay. This concerns volume only: it removes no authorization check and grants no permission to perform a proposed action. | user, 2026-11-14 |
| A25 | **Authorization policy (DR-14).** Confirmation by consequence and origin (§2.7). A pressed follow-up or an opened notification cannot start ongoing work without its confirmation. Application actions start with the assistant's settings and notification preferences, then accounting actions under their approval cards and backend permissions (A9). | user, 2026-11-14 |

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
- The template's example ports (`WebSearch` and `EmailSender`) and example tools (`searchWeb` and `sendEmail`) are no longer offered to the model, and their code is removed once no stored conversation needs it, or after a migration of stored parts (A16).

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
- The template's **user-defined** tracking tasks ("watch X for me") stay available as infrastructure. Their tools are hidden from chat while their sources read the web only (`kind: "web"`, A17), and come back as user-defined monitors over the books in Phase 5.1. How they appear in the KeepInTax UI remains a UI-spec decision.
- Authorization (A11, A14; 2026-11-14): the jobs above are product-defined, so they are authorized at product level, subject to the user's notification preferences and an opt-out. A job acts on its own only under a recorded standing authorization, only with reversible actions, and reports what it did; anything else becomes a proposed action in a notification. `email-import`'s automatic linking (A4) runs under the standing authorization of the connected inbox; expense approval stays separate. Findings reach the user through the notification lifecycle of §2.9.

### 2.3 Data scoping (A5)

- New columns `data_owner_user_id` (and `business_number` where it matters) on `agent_conversations`, `agent_memories`, `agent_tracking_tasks` and `agent_notifications`. They go in a new dated SQL script, and the gateway's table registry (`mysql-agent-tables.ts`) is updated to match.
- The gateway's row filters become (actor = me **and** owner = the request's data owner). A regular user's actor and owner are the same person, so nothing changes for them.
- Accountant scope: the accountant's own cross-client chats use `owner = actor` and reach clients only through the accountant tools. Those tools list clients from `delegation.getUsersForAgent` and check the scope on each call.

**As built (2026-11-05, `2026-11-05_agent_actor_owner_scope.sql`):** instead of an owner column on each table, `agent_users` itself is keyed by (actor, data owner), so every agent table (conversations, messages, stream, steers, documents, memory, settings, usage, tasks, notifications) is scoped to the pair with no change of its own. `agent_chat_conversations.business_number` records the business a conversation started in. **Revised 2026-11-05 (product decision):** a conversation may cover one, several or all of the same data owner's businesses; switching business keeps it, switching client does not. **Revised 2026-11-15 (business selection):** the page's active business is no longer the tools' default; a read uses the business the user named or established in the conversation, else the only one, else asks (`backend/agent/GUIDE.md`, "Business selection"). `queryExpenses` takes `businessNumbers` / `allBusinesses` for a combined total computed in agorot (none when a business fails). Legacy rows keep a NULL owner and are never served. Details: `backend/agent/GUIDE.md`, "Isolation".

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

- Who sees it: the owner sees it, and so does an accountant with a delegation that covers the business, under that delegation's permissions (A5.1). Each fact records the actor who stated it. Personal memory, inferences, chats and an accountant's private notes are not in this table: they stay with the pair (A13).
- `readAgentSession` gains `needsOnboarding`, which offers an optional onboarding entry the user starts (user 1). It is not a pop-up that interrupts the chat (A19).
- Business facts the user states in chat are written here. Before this table exists, they are held in memory marked `kind: business_fact` and moved here by Phase 4's migration, never kept in both (A12).

### 2.5 Interaction model (added 2026-11-14; approved 2026-11-14 as A11–A25; not built)

There is one assistant. Chat is the user's main way into **every supported capability**; a notification inbox carries what the assistant starts on its own. The line is drawn by **who started** the interaction, not by what the assistant may do.

| | User-initiated (chat) | Agent-initiated (notifications) |
|---|---|---|
| Trigger | A message the user sends; a button they press (a question's option, a follow-up, an approval); a notification they open | A product-defined job (§2.2) or recommendation job (Phase 5.2), or a monitor the user authorized (Phase 5.1), running in the background |
| Behavior | Does what was asked, with every supported capability: reads, application actions, settings, memory, monitors, and mixed requests in one message. It asks only what the current request needs. It may end with an optional follow-up on the same topic | Produces an inbox item: an **alert** (from a job or a monitor) or a **recommendation** (the assistant's initiative). It acts on its own only under a recorded standing authorization, reversibly, and reports it (A11); anything else is a proposed action |
| Learning | Saves explicit preferences and stable facts the user states, with a visible notice and undo (A20, §2.8). It may record an observed interest as an inference (Phase 4.1) | Uses application facts, explicit statements and inferences to judge what is relevant to recommend |
| Never | Onboarding, profile-completion or unrelated questions inside an ordinary request (onboarding is user-started, A19); follow-ups used as disguised onboarding; a monitor created because the user only asked a question | Treating an inference as a fact or a permission; performing a proposed action without the user |

The user never switches modes. Any intent classification (Jev turn signals, `agent-turn-signals.ts`) is an internal hint, for example for reasoning effort or planning. **It never authorizes anything**: authorization is the server's checks in §2.7.

### 2.6 Clarification, follow-ups and question continuation (added 2026-11-14; approved as A18; not built)

Two contracts, kept separate in tools, in how a turn ends, and in the UI.

**Blocking clarification** (`askUserQuestion`):
- It is used only when the current request cannot be completed without the answer (which business; which of several matches). The answer is never a preference for later.
- Options carry a value as well as a label, `{ label, value }`. For `BUSINESS_REQUIRED` the values are business numbers taken from the error (`agent-domain.service.ts:544-548`), plus "all businesses" when the question adds money (queryExpenses semantics).
- The UI renders the options as buttons from the **stored** message part, so they come back after a reload.
- **Reliable continuation (A18):** `askUserQuestion` is a tool the page answers (no server `execute`), on the model of `applyAgentChatApprovals` (`chat/turn/agent-chat-approvals.ts:30-66`). An answer is accepted only for a stored, still-open question in the same conversation, and only as one of its values (or free text where allowed). The first answer wins; a repeat or stale answer is a no-op. The original request, with its range, filters and the reads already made, continues **in the same turn**, so the answer check's same-turn evidence rule still holds. A message the user types instead of pressing a button closes the open question as superseded. This is a deviation from the template, listed in `backend/agent/GUIDE.md` as planned.
- Current code (until Phase 3.1 is built): the template's behavior, where `execute` returns `{ asked: true }` and the chosen label arrives as the next user message.

**Optional follow-ups** (`data-followUps`, `agent-follow-up-questions.ts`):
- They are written after the answer by their own call, continue the current topic, and are things the assistant can actually do. They never ask about the user, do onboarding, or advertise capabilities that do not exist.
- The page fetches them when `data-followUpsPending` arrives (`GET /api/agent/chats/:id/follow-ups`) and renders the stored part after a reload.
- Pressing one sends its text. The server checks that the text was one of the stored follow-ups and records that origin (§2.7). A follow-up never creates a task, a monitor or a memory by being pressed; a follow-up that leads to ongoing work goes through that work's setup card (A21, A25).

**Honest capability boundary:** what is offered to the model, the role paragraph and `readAppKnowledge` all come from one list of supported capabilities. An unsupported request (for example "notify me if my fuel expenses increase" before Phase 5.1) is answered honestly: say what is not available, offer the nearest supported thing, and create nothing that imitates it. `searchWeb` and `sendEmail` are not offered (A16); the template's web-only tracking, suggestion and opportunity tools are hidden from chat (A17). Both stay registered for stored conversations (§3.10).

### 2.7 Action authorization and idempotency (added 2026-11-14; approved as A11, A14, A21, A25; not built)

Chat is **not** read-only. An explicit request reaches the matching supported capability, mixed read-and-write requests included. The server enforces each call; the prompt alone is never the boundary.

1. **Access** (unchanged): `FirebaseAuthGuard`, the business check in `requestBusiness`, and `assertAccessStillHolds` before each tool call (§2.1, §2.3 as built).
2. **Backend permission** (unchanged, A9): actions on the books, money or official documents need the backend's permission (`EXPENSES_APPROVE` or the relevant scope) **and** an approval card.
3. **Confirmation by consequence (A25).** This extends the existing effect table (`agent-tool-traits.ts`) and the user's action rules (`agent-action-rules.ts`). Current code, until Phase 3.2 is built: deleting tasks and sending email ask; creating or updating tasks, settings and memories run.

   | Class | Examples | Approved default |
   |---|---|---|
   | Read | books and reports reads; listing memories | runs |
   | Explicit personal record | save, correct or forget a memory the user asked for; a stable fact the user explicitly states (A20) | runs; the reply states the tool's actual result, and a fact saved without a request shows a "saved" notice with undo |
   | Reversible assistant setting | the assistant's settings and notification preferences; action rules (granting `allow` already asks) | runs when the user named the setting and value; one question when ambiguous |
   | Ongoing work | create or resume a monitor | one setup card with the resolved parameters (A21); pausing or stopping runs directly |
   | Books, money, official documents, irreversible, or in the user's name | A9 actions, deleting tasks, sending email | approval card and backend permission (A9) |

   Application actions offered in chat start with the assistant's settings and notification preferences, then accounting actions under their approval cards and backend permissions (A25).
4. **Origin (A25).** The server records each turn's origin on the user message: typed; an answer to an open question; a follow-up pressed (checked against the stored follow-ups); a notification opened (through the server, §2.9); an approval; or a background run. A pressed follow-up or an opened notification cannot start ongoing work without its setup card. Text inside tool results, attached documents, emails and notification bodies stays outside content and never authorizes an action (the existing `<outside_content>` rule, and Phase 13's prompt-injection review).
5. **Background runs (A11, A14).** A background run acts on its own only under a recorded standing authorization, only with reversible actions, and reports what it did; anything else becomes a proposed action in a notification. Connecting an inbox is the standing authorization for A4's automatic import and linking; expense approval stays separate. Background **reads** are authorized in two classes: product-defined jobs and recommendation jobs at product level, subject to notification preferences and an opt-out; a user's own monitors one by one (A21). Both stay within A5 and the access checks.
6. **Idempotency:** every write takes a key derived from its tool call id, so a retried, resumed or repeated answer cannot create a second memory, monitor or link.

### 2.8 Knowledge about the user (added 2026-11-14; approved as A12, A13, A20, A22, A23; not built)

"Knowing the user" means finding and applying what is relevant when it is needed, not putting everything into every request. There are four layers, each with its own provenance.

| Layer | What | Where and with what provenance | Correction and deletion | Certainty | Used for |
|---|---|---|---|---|---|
| Application facts | businesses, VAT type, expenses, reports | KeepInTax data, read live through the books and reports tools; never copied into memory | corrected in the app; the assistant reads again | authoritative as of the read; results say when data is partial | evidence in answers (§3.3, §3.4 rules) |
| Explicit statements and preferences | "I prefer monthly breakdowns"; a business fact the user states | the person's preferences in `agent_memories` (A6), with `kind`, `source: explicit`, `source_message_id`, `updated_at` and what it supersedes (Phase 4). Business facts go to the business profile (§2.4), shared under delegation with the stating actor recorded (A5.1). Before the profile exists, they are held in memory as `kind: business_fact` and moved by Phase 4, never kept in both (A12) | the user asks in chat, uses the undo on a "saved" notice, or edits and deletes in a list; a correction updates in place; a deletion removes the row | true until changed; the newest statement wins | personalizing answers and defaults |
| Inferences | "often asks about fuel", "reads expenses by month"; an uncertain reading of something the user said (A20) | a new `agent_inferences` store, with the pair (A13): topic, statement, evidence (message ids, counts, dates), confidence, first and last seen, status (candidate, confirmed, rejected, expired) (Phase 4.1) | visible as "what the assistant noticed"; the user can reject or delete, or confirm one into an explicit preference. An inference expires after 90 days without new evidence; a rejection keeps only a topic suppression key (A23). Dismissing a notification does not reject an inference (A15) | always labelled inferred | ranking and wording recommendations only; never an answer's premise, a setting, or a permission |
| Authorized ongoing work | monitors, jobs | tracking tasks with the message and setup card that authorized them, their parameters and channel (Phase 5.1, A21); the product-defined jobs of §2.2 at product level (A14), with the standing authorizations they act under (A11) | changed, paused or stopped by the user in chat or the task list; opt-out and notification preferences for product jobs | not applicable | the basis for background reads, actions and alerts |

- Learning from interactions is **on by default**, visible to the user, with a switch that turns it off and deletes what was inferred (A22). Allowed inference sources: the user's own messages and which reads they asked for, within the pair (A5, A13). Not allowed: the contents of tool output, attached documents, other pairs' conversations.
- A stable fact the user explicitly states may be saved without a separate "remember" request, with a visible "saved" notice and an undo; an uncertain interpretation stays an inference (A20). A personal preference goes to memory; a business fact to the profile (A12).
- Retrieval: short explicit preferences stay in `<user_context>`, tagged by kind. Other facts, and every inference, move behind a read tool (`recallUserKnowledge`) once memory grows. Inferences are never injected as `<memory>`.

### 2.9 Notifications (added 2026-11-14; approved as A14, A15, A24; not built)

The notification inbox is the main surface for what the assistant starts. It extends the existing table (`user_notifications`, in `2026-10-22_agent_harness_schema.sql`; §2.3 calls it `agent_notifications`) rather than adding another.

| Field (new migration) | Purpose |
|---|---|
| `kind` | `alert` (a job or monitor), `recommendation` (the assistant's initiative), and the existing `opportunity` and `task-error` |
| `source` | the job or monitor id, or the recommendation rule and its version |
| `dedupe_key` | unique per user: one item per condition and period |
| `evidence` | figures with when they were read, the range, the business and the tool |
| `proposed_action` | an optional draft `{ tool, input }`; a job never executes it |
| `status` | `new`, `seen`, `opened`, `acted`, `dismissed`, `expired` |
| `expires_at`, `relevance`, `conversation_id` | expiry, the relevance it passed, the chat opened from it |

- Jobs upsert by `dedupe_key`: a repeat updates the evidence instead of adding another item.
- Dismissing an item silences its key for its period. It does **not** reject the inference behind a recommendation; a separate "not interested" action does that (A15, A23).
- Opening an item goes through the server (`openNotificationInChat`). It starts or reopens a conversation with a server-written context part (as `data-userContext` is written; the page cannot forge it), holding the evidence and the proposed action. The assistant's first message says which parts are application facts and which are inference, and reads the figures again before relying on them. The proposed action runs only when the user asks, under §2.7.
- Alerts come from a product-defined job (§2.2) or from a monitor the user authorized (Phase 5.1). Recommendations come from product-defined recommendation jobs (A14). Both respect the user's notification preferences and opt-out.
- Volume (A24): there is **no numerical cap** on recommendations (daily, weekly or other count), and no configurable cap in its place. What reaches the inbox is governed by relevance filtering, deduplication, dismissal and expiry. This removes no authorization check and grants no permission to perform a proposed action.

### 2.10 Template behavior removed from chat (added 2026-11-14)

These are confirmed defects (Appendix A) that the confirmed product intent resolves. They are scheduled in Phase 3.1:
- `<profile_gaps>` and the gaps built from the template's example settings (`agent-user-context.ts:36-66`): the assistant no longer asks for profile details in an ordinary request.
- `<missing_details>` ("You keep the user's profile complete"), the memory rule to ask for the user's name, and the small-talk hint that points to `<profile_gaps>`.
- The role paragraph, the example `<tasks>` section and the follow-up writer's capability list no longer advertise web search, email, or tracking tasks as books monitoring.
- The template's example skills: `research-brief` (already listed in §3.10) and `new-user-setup` (replaced by `keepintax-onboarding`, §3.2, which runs only when the user starts onboarding, A19).
- Not offering `searchWeb` and `sendEmail` (A16), and hiding the web-only tracking tools (A17), while keeping them registered for stored conversations (§3.10).

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

Approved changes (2026-11-14) to this "template behavior" baseline, all still to be implemented:
- `askUserQuestion`: options with values, rendered from the stored part, answered by the page and validated by the server, continuing the same turn (§2.6, A18; Phase 2, Phase 3.1).
- `saveAgentMemory` / `updateAgentMemory` / `forgetAgentMemories`: they stay available in every chat turn. Provenance fields come in Phase 4 (§2.8). A stable fact the user explicitly states may be saved without a request, with a "saved" notice and undo (A20). Personal preferences only; business facts go to the profile, temporarily marked `kind: business_fact` in memory until it exists (A12).
- `updateUserSettings`: the template's example fields (`seeking`, `offer`, `areas`, `notRelevant`, `writingStyle`) are no longer read as profile gaps (§2.10). KeepInTax's own settings for the assistant and notification preferences replace them; they are the first application actions offered in chat (A25).
- The template's tracking-task, task-suggestion and opportunity tools are hidden from chat (A17); `searchWeb` and `sendEmail` are not offered (A16). See §3.10.
- Every write takes an idempotency key (§2.7).

### 3.2 Business profile — namespace `profile`

| Tool | Effect | Backed by | Capability |
|---|---|---|---|
| `readBusinessProfile` | read | new `agent_business_profiles` table, plus `business.getUserBusinesses` (business type, VAT status) | user 1, 9 |
| `updateBusinessProfile` | write | the same table; it records the chat as the facts' source | user 1, 9 |
| `setOnboardingStatus` | write | the same table | user 1 |

The `keepintax-onboarding` skill replaces the template's `new-user-setup`. It is the onboarding conversation: what the business does, working from home, car use and other facts. It runs only when the user starts onboarding, never inside an ordinary request (A19). **RULES PENDING**: the product owner supplies the question list.

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

**Phase 3 as built (2026-11-11, KT-089).** Where it differs from the tables above, and why:

- `queryTransactions` reads the transactions page's cache path (`TransactionProcessingService.getExpensesFromCache` / `getIncomesFromCache` after the sync-state check), not the legacy `getTransactionsByUserID` table. Bank data reports the last sync as recorded; totals are complete only after a successful sync with every row in ₪ and none on an unlinked account.
- `queryIssuedDocuments` totals per document type **and currency** (documents are stored in their own currency, not converted), with a count across currencies.
- `listCategories` reads the merged catalog (`CatalogService.getMergedExpenseCatalog` in a delegation-aware context) rather than `getUserCategoriesGrouped`, which lists only the business's own rows.
- `getProfitAndLoss` uses the read-only `createPnLReportFromJournal`; the screen's depreciation preparation is not run, so the result says depreciation may be missing.
- `getVatSummary` and `getAdvanceTaxStatus` widen a range to the whole reporting periods the reports count by (a bi-monthly business by two months) and say so.
- `listUpcomingReports` does not call `listForClient` (it generates workflows): it uses the new read-only `ReportWorkflowService.listStoredForClient` and `TasksGeneratorService.expectedReportPeriods`. National Insurance is not in KeepInTax.
- `getReportReadiness` calls `getReportPreview` with the new `readOnly` option (no inbox processing, pairing or matching); Drive files not yet read are not included.
- The books tools load through tool search (namespace `books`; `queryExpenses` stays always loaded), as do the reports tools (namespace `reports`).
- Each of the new reads is one business, except `listUpcomingReports`, which lists every one of the owner's businesses when none is named (with `activeBusiness`: since 2026-11-15 the conversation's business, else the only one). Only `queryExpenses` adds money across businesses.

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

How they are removed (A16, approved 2026-11-14; not yet done, Phase 1, step 5): they stop being offered to the model first. Their code is deleted once no stored conversation uses them, or after a migration of stored parts. The reason: stored chat messages are validated against the registered tools (`app-agent-tools.ts:47`), and an unknown tool name counts as the riskiest effect (`agent-tool-traits.ts:69-72`), so deleting a tool outright affects conversations that already used it. The planned Composio email-document tools (§3.6) are not affected.

The template's tracking-task, task-suggestion and opportunity tools are not removed: they are hidden from chat while their sources read only the web, and their infrastructure (tasks, worker, leases, notifications) is kept for the books monitors of Phase 5.1 (A17, §2.2).

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
5. Remove the example tools and ports. Register the namespaces. (A16, 2026-11-14: they are first withdrawn from what the model is offered, in Phase 3.1; their code goes once no stored conversation needs it, or after a migration of stored parts, §3.10.)

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

**Status (2026-11-14, from code):** the page exists (A7) but does not meet every item above (see "Build status by phase"). Remaining, with what the interaction model adds:
- item 3: `askUserQuestion` as buttons from the stored part, disabled once answered (§2.6);
- item 4: load a stored conversation and resume its stream (reload tests in §6.1 need it), plus steer;
- follow-ups: fetch on `data-followUpsPending`, and render the stored part after a reload (§2.6; Appendix A, F6);
- item 5: the side panel, with memories (and later inferences, Phase 4.1) and notifications, with open-in-chat (Phase 5);
- item 6, and the stream-parser unit test.

**Status update (2026-11-15, KT-108):** done for Phase 3.1: item 3's `askUserQuestion` buttons (disabled once answered or superseded); item 4's stored-conversation load and stream resume (`?chat=`); follow-ups fetched on `data-followUpsPending` and shown from the stored part after a reload; the "saved" notice with undo. Still open: steer (item 4), the side panel (item 5), the trace link (item 6). The page uses the AI SDK's stream parser, so item 6's parser test is covered by unit specs of the page's own helpers (`dev-agent-chat.spec.ts`).

### Phase 3 — Books and reports Q&A (§3.3, §3.4)

1. Tools, port implementations, and the system prompt's Hebrew section on reading numbers: always quote the period, never invent a number, and say when the data is partial.
2. An answer-check rule: every number in an answer must come from a tool result in the same turn (template answer check).

**Evals:**
- About 30 Hebrew questions, among them "כמה הוצאתי על דלק השנה?", "כמה אני מוציא על פלאפון?" and "האם הוצאתי חשבונית ללקוח X?", plus period edge cases (VAT bi-monthly, a year boundary).
- Judges check four things: the right tool and filters were used, the numbers match the fake data, the answer is in Hebrew, and nothing was invented.

### Phase 3.1 — Chat interaction corrections (added 2026-11-14; §2.6, §2.10; built 2026-11-15, KT-108)

There are no schema changes.

1. Remove the template behavior in §2.10: `agent-user-context.ts`, `agent-instructions.ts`, `long-term-memory.server.ts`, `agent-turn-signals.ts`, `agent-skills.ts` (`new-user-setup` and `research-brief`), and `agent-follow-up-questions.ts`. Replace `<missing_details>` with "ask only what the current request needs".
2. The honest capability boundary (§2.6): the prompt and the follow-ups name only supported capabilities, and a request for books monitoring is answered as not yet available. Stop offering `searchWeb` and `sendEmail` to the model (A16; Phase 1, step 5) and hide the template's web-only tracking, suggestion and opportunity tools from chat (A17). Keep all of them registered, so stored conversations still validate (§3.10).
3. `askUserQuestion` (A18): options with values. `BUSINESS_REQUIRED` gives business numbers, plus "all businesses" where money is added (`agent-tool-error-next-step.ts`). The tool is answered by the page (no server `execute`); a new question-answer module beside `agent-chat-approvals.ts` accepts only an open question's own values, once, and continues the same turn. `agent-chat-request.server.ts` accepts the answer, and `app-agent.ts` stops on the open call instead of `agentAskedUser`. Stored label-only questions (`{ asked: true }`) still validate and show as answered.
4. Record each turn's origin on the user message (§2.7, item 4). The rules that act on it are in Phase 3.2.
5. Idempotency keys for the existing writes (§2.7, item 6).
6. Memory save, correction and deletion in ordinary chat, and mixed read-and-write requests, with the existing tools. Stable facts the user states may be saved with a visible "saved" notice and undo (A20). A business fact goes to memory only as `kind: business_fact`, held for Phase 4's move to the profile (A12).
7. Update the prompt snapshot tests; invert `missing-details.eval.ts` (it asserts the removed behavior); list the KeepInTax changes in `backend/agent/GUIDE.md`, "What KeepInTax changed" (A1, A18). GUIDE.md's "Planned interaction model" section moves into that table as each change lands.

UI work for this phase is in Phase 2's remaining items.

**Evals and tests:** S1, S2, S3, S4, S6, S10 and S11 in §6.1. Unit tests: an open question accepts only its own values, once; a stale or repeated answer changes nothing; a typed message supersedes an open question; a follow-up press is recognized from the stored part; `searchWeb`, `sendEmail` and the tracking tools are not offered but stored parts that used them still validate.

**Done when:** S1, S2 (with the validated continuation), S3, S4, S6, S10 and S11 pass.

**Status (2026-11-15, KT-108; details in `backend/agent/GUIDE.md`, "What KeepInTax changed" and "Phase 3.1: chat interaction"):**
- Items 1–7 are implemented with no schema change. As built: the capability list is `agent-capabilities.ts`; hidden tools stay registered, are left out of every step's `activeTools` and of the deferred-tools line, and are denied server-side if called (`AGENT_TOOL_NOT_AVAILABLE`); `askUserQuestion` has no `execute`, takes `{ label, value }` options (2–6; a plain string still validates as its own value) and is answered through `agent-chat-question-answers.ts`; a typed message closes an open question as `{ superseded: true }`; a stale, repeated or other-tab press is refused (409 `AGENT_QUESTION_CLOSED`) and an unoffered value too (400); the origin is a server-written `data-turnOrigin` part (`typed`, `follow-up`, `question-answer`, `approval`); idempotency keys are derived from the conversation and tool call id and used as the id of a created memory or tracking task; a business fact is held in memory with the content prefix `[business_fact] ` until Phase 4's column exists.
- One origin rule is applied now, as the minimum S3 needs: a turn started by a pressed follow-up runs no write tool. The other origin and consequence rules remain Phase 3.2.
- Evals (`kt108-final2-interaction`, 3 repetitions, on the code before the last app-knowledge wording fix): S2 (four cases, including a business switched between question and press), S3, S4, S6, S10, S11 and S12's Phase 3.1 part 3/3 each, S1 2/3 (the miss is the books judge's numeric statement on an answer whose figures all came from the tool, the open judge item recorded in KT-089), the inverted `missing-details.eval.ts` 9/9; 38/39 combined, 39/39 code checks. The regression pass on the final revision did not run (stopped for low memory); its earlier run, classified misses and the commands to finish it are in KT-108.
- Remaining gaps: `readAppKnowledge`'s pages, plans and help are still the template's examples (only its how-it-works comes from the capability list); the dev page was not runtime-verified in a browser; eval cases whose subject is a hidden template capability are skipped with a reason, including the approval-card evals (no offered tool asks for approval except an `allow` action rule) until Phase 3.2; steer, the side panel and the trace link (Phase 2) are not built.

### Phase 3.2 — Action authorization policy (added 2026-11-14; §2.7; decisions approved as A21, A25; not built)

1. The consequence classes and their approved defaults (§2.7, item 3) in `agent-tool-traits.ts`, `agent-action-rules.ts` and `agent-tool-approval.ts`. `toolApproval` reads the turn's origin: a pressed follow-up or an opened notification cannot start ongoing work without its setup card (A25).
2. The setup card for creating or resuming a monitor (A21). This replaces the current `allow` default for `createTrackingTask`; pausing and stopping stay direct.
3. The first KeepInTax application actions offered in chat: the assistant's settings and notification preferences. Accounting actions follow later, in their own phases, under their approval cards and backend permissions (A9, A25).

**Tests:** S5 in §6.1. A follow-up or a notification body cannot start ongoing work without its card. A retried answer duplicates no write. A9 actions still need the card and the backend permission.

**Depends on:** Phase 3.1. Phases 4 (profile writes), 5.1 and 5.2 build on it.

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

**Added 2026-11-14 (§2.8; decisions approved, not built):**
5. Memory provenance: a new dated migration adds `kind`, `source`, `source_message_id` and `supersedes` to `agent_memories`, updated in the gateway registry (`mysql-agent-tables.ts`) and the `src/lib/supabase` types. Memory writes record them.
6. A read tool for user knowledge (`recallUserKnowledge`) for when the injected list grows; injected preferences are tagged by kind.
7. A list in the dev page where memories can be corrected and deleted (Phase 2, item 5).
8. Items 1 and 4 follow A6 and A12. The profile migration moves each memory marked `kind: business_fact` into the profile and deletes it from memory, so it is never in both. The profile is shared under the delegation's permissions, with the stating actor on each fact; personal memory, inferences, chats and an accountant's private notes stay with the pair (A5.1, A13).
9. Item 2's `needsOnboarding` offers an optional onboarding entry or notification the user opens. Item 3's skill runs only when the user starts it, never inside an ordinary request (A19).
10. The "working from home" eval follows A20: a stable fact the user explicitly states is saved with a visible "saved" notice and undo; an uncertain interpretation becomes an inference (Phase 4.1).

**Evals added:** S4 with provenance; S12 (a stable fact stated in passing); a correction keeps a single current value; a deleted memory is not used afterwards; a business fact never appears in both memory and profile after the migration; an accountant sees a delegated client's business facts but not the client's personal memory.

### Phase 4.1 — Learning from interactions (added 2026-11-14; §2.8; decisions approved as A15, A20, A22, A23; not built)

1. A new dated migration for `agent_inferences`, and its registry entry.
2. An inference writer after each turn: topics and which reads were asked for, from the user's own messages, within the pair (A5, A13). Learning is on by default (A22).
3. Expiry after 90 days without new evidence; a rejection keeps only a topic suppression key, so the topic is not inferred again (A23).
4. Inferences listed as "what the assistant noticed", which the user can reject, delete, or confirm into a preference, plus a switch that turns learning off and deletes what was inferred (A22).

**Evals:** S9 in §6.1. An inference is never stated as a fact, never changes a setting, never creates or authorizes a monitor. Turning learning off deletes existing inferences and records no new ones.

**Depends on:** Phase 4.

### Phase 5 — Background jobs engine (§2.2)

1. `AgentWorkerService` inside Nest, the `AGENT_WORKER` switch, the job registry and per-job handlers.
2. Notifications to the user, and a list of them on the dev page.

**Tests:**
- Integration tests against MySQL: claim, lease, a crash before completion, a retry, two workers.
- Jest specs for the provider's start and stop.

**Added 2026-11-14 (§2.7, §2.9; decisions approved, not built):**
3. The notification lifecycle: a new dated migration extends `user_notifications` (kind, source, `dedupe_key`, evidence, proposed action, status, expiry, relevance, conversation), with upsert by key, dismissal and expiry. No numerical cap on volume (A24).
4. `openNotificationInChat` and the server-written notification context; the bell and list on the dev page (Phase 2, item 5).
5. Standing authorizations (A11): a job acts on its own only under a recorded standing authorization, only reversibly, and reports what it did; anything else becomes a proposed action. Connecting an inbox records the authorization for A4's import and linking (Phase 7); expense approval stays separate.
6. Notification preferences and an opt-out for product-defined jobs (A14).

**Tests added:** a repeated run updates one item; a dismissed key stays silent for its period; opening an item twice reuses its conversation; a notification body never authorizes an action; a job without a standing authorization changes nothing and only proposes; an opted-out job produces no notification.

### Phase 5.1 — User-requested monitors over the books (added 2026-11-14; decisions approved as A17, A21; not built)

1. A tracking-task source kind for book metrics (for example, one category's spend per period against its baseline), read through `KeepInTaxBooks` in the worker (Phase 5). It reuses the template's tracking-task infrastructure, which A17 keeps.
2. Monitor tools that record the authorizing message and its setup card (A21), the parameters and the channel; resuming takes the card again; pause and stop run directly.
3. Alerts as `kind: alert` notifications (Phase 5, item 3).
4. Until this phase is built, S10 applies: the assistant says books monitoring is not available and creates nothing in its place.

**Tests and evals:** S7 in §6.1; a failed task creation is reported as failed; an unknown outcome is checked before retrying; a worker crash mid-run (lease); a revoked delegation stops the monitor's reads (A5); no duplicate alert per period.

**Depends on:** Phases 3.2 and 5.

### Phase 5.2 — Recommendations (added 2026-11-14; §2.9; decisions approved as A14, A15, A22, A24; not built)

1. A first rule-based recommendation job over application facts and inferences. It is authorized at product level and respects the user's notification preferences and opt-out (A14). **RULES PENDING**: which recommendations come first, and their relevance criteria (§5).
2. Volume (A24): no daily, weekly or other count-based limit, and no configurable cap. What reaches the inbox is decided by relevance filtering, deduplication, dismissal and expiry.
3. Dismissal silences the item's key; a separate "not interested" action rejects the inference behind it (A15).
4. A recommendation may propose an action, including a monitor; nothing is created until the user asks, under §2.7.

**Evals:** S8, S9, S13 and S14 in §6.1.

**Depends on:** Phases 4.1 and 5. The alerts of Phases 6, 8, 10 and 11 use the lifecycle of Phase 5, item 3, and do not wait for this phase.

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
| Phases 3.1–5.2 | The decisions in §7 (DR-1 to DR-14): **approved 2026-11-14** (A5.1, A11–A25); no input outstanding | nothing |
| Phase 5.2 | Which recommendations come first, and their relevance criteria (**RULES PENDING**) | the first recommendation job |

## 6. Testing strategy (every tool)

| Layer | Tool | What it proves |
|---|---|---|
| Unit (vitest, agent) | each tool | input schema, its effect trait, its namespace, and mapping to the port |
| Unit (Jest, Nest) | each port method | the same permission checks as the app: owner, delegation scope, impersonation, business ownership |
| Integration (vitest and MySQL) | gateway, jobs | scoping (A5), job claims and leases, and the profile table |
| Evals (DeepEval and Jev judges, fake ports) | each capability | tool choice, arguments, numbers that match the data, Hebrew, approval before every action, no invention; repetitions with Wilson intervals |
| Traces (local Langfuse) | every dev chat and eval | what the model saw and did; the source of new eval cases |
| Manual (dev page) | each phase | the visual check-list in the task file |
| Unit (vitest, agent), added 2026-11-14 | question answers, follow-up origin, idempotency | an open question takes only its own values, once; a pressed follow-up is recognized; a retried write is not repeated |
| Evals, added 2026-11-14 | interaction model | the scenarios in §6.1, with empty settings (`emptyEvalSettings`) as well as filled ones, and several businesses with none active |
| Unit and integration, added 2026-11-15 | approved policy (A11–A25) | the consequence classes and origin rules; a setup card for every monitor creation or resumption; a background job acts only under a standing authorization; dismissal versus "not interested"; inference expiry and suppression; the learning switch deletes inferences; business facts never in both memory and profile; delegated profile visibility versus pair-scoped memory; no count-based limit anywhere in the notification path |

Paid runs (evals and harnessing) use small batches: 3 repetitions per case, run per phase, never in a loop without a cap.

### 6.1 Interaction acceptance scenarios (added 2026-11-14)

Today's evals miss the observed defect: the books evals use filled settings, and every multi-business case sets an active business (Appendix A, F3). These scenarios close that gap.

| # | Scenario | Expected | Phase |
|---|---|---|---|
| S1 | "כמה הוצאתי על דלק השנה?" with empty settings and one business | One read; the answer gives the range, the business and what is not counted; no question about the user; nothing saved, no setting or task written; optionally a follow-up such as a monthly breakdown | 3.1 |
| S2 | The same, with several businesses and none active | Business buttons with real values; nothing else asked; after a press, the same request completes in the same turn with its original range and search (A18); a second press, a stale press or a reload neither repeats nor loses it | 3.1, Phase 2 |
| S3 | Press the follow-up "by month" | The same analysis continues, grouped by month; no task, memory or setting created | 3.1 |
| S4 | "Remember that I prefer monthly breakdowns", then "actually, quarterly", then "forget that" | Saved, updated in place, deleted. Each reply states the tool's actual result; the next comparable answer follows the current preference. Provenance from Phase 4 on | 3.1, 4 |
| S5 | "Change <one of the assistant's settings or notification preferences> to <value>" | Runs directly when the setting and value are named (one question when ambiguous) and the reply states the stored result; an accounting action is offered only once built, under its approval card and backend permission; an unsupported setting is explained as in S10 (A25) | 3.2 |
| S6 | "Show my monthly expenses and remember that I prefer this view" | The read and the save in one turn, with no mode switch; both results stated | 3.1 |
| S7 | "Notify me if my fuel expenses increase", once Phase 5.1 exists | Asks only what is missing; one setup card with the resolved parameters; the monitor exists only after it is confirmed (A21); a failure is reported as a failure; pausing and stopping later need no card | 5.1 |
| S8 | A recommendation in the bell is opened | The chat opens with its evidence, with facts and inference labelled; the figures are read again; the proposed action runs only if the user asks, under §2.7 | 5, 5.2 |
| S9 | Repeated fuel questions produce an inference | Shown as inferred and can be rejected; never stated as a fact, never a setting, never a monitor or a permission | 4.1 |
| S10 | "Notify me if my fuel expenses increase", before Phase 5.1 | Says books monitoring is not available yet, offers the current figure or breakdown, and creates no web task or other substitute | 3.1 |
| S11 (added 2026-11-15) | A conversation stored before Phase 3.1, which used `searchWeb` or a label-only `askUserQuestion`, is reopened and continued | It loads and validates; the old question shows as answered; the model is offered neither `searchWeb`, `sendEmail` nor the web-only tracking tools (A16, A17) | 3.1 |
| S12 (added 2026-11-15) | In a fuel question the user says "I started working from home this year" | The question is answered; the stable fact is saved without a "remember" request, with a visible "saved" notice and undo; as a business fact it goes to the profile (before Phase 4, to memory marked `kind: business_fact`); an uncertain reading is kept as an inference, not a fact (A12, A20) | 3.1, 4 |
| S13 (added 2026-11-15) | A recommendation is dismissed; another one is marked "not interested" | The dismissed item's key stays silent for its period and its inference is not rejected; "not interested" rejects the inference and keeps only its topic as a suppression key (A15, A23) | 5.2 |
| S14 (added 2026-11-15) | Several distinct, relevant recommendations arise on the same day, plus a repeat and an irrelevant one | Every distinct relevant one is delivered, with no count-based limit; the repeat updates its existing item; the irrelevant one is filtered out; expired items leave the inbox; none performs its proposed action; an opted-out job delivers nothing (A14, A24) | 5.2 |
| S15 (added 2026-11-15) | With an inbox connected, `email-import` finds an invoice matching a transaction | It is imported and linked automatically and reported afterwards; the link can be undone; the expense still waits for the user's approval; without a connected inbox nothing runs (A4, A11) | 7 |

Focused checks for these phases: a reload while a question is open; a stopped stream while it shows; two tabs answering; a stale answer after a new message; the business switched before the answer; access revoked before the resumed read; follow-ups after a reload; a retried answer (no duplicate write); a worker crash mid-run; a repeated or dismissed notification.

## 7. Decisions (raised 2026-11-14; approved 2026-11-14)

Every decision below was **approved by the product owner on 2026-11-14** and is recorded in §1 (A5.1, A11–A25). Each takes the recommended option, except DR-13, which was resolved differently. Approval is not implementation: the work each one governs is still to be built, in the phases named.

| ID | Resolution (approved 2026-11-14) | Recorded as | Implemented in |
|---|---|---|---|
| DR-1 | Recommended (a): background actions only under a recorded standing authorization, reversible, reported afterwards; connecting an inbox authorizes A4's import and linking; expense approval separate | A11 | Phase 5, item 5; Phase 7; Phase 11's `accountant-daily-prep` |
| DR-2 | Recommended (a): A6 kept; before the profile exists, business facts are held in memory marked `kind: business_fact` and moved in Phase 4, never in both | A12 | Phase 3.1, item 6; Phase 4, items 1, 4, 8 |
| DR-3 | Recommended (a): business facts shared under delegation with the actor recorded; personal memory, inferences, chats and private accountant notes stay with the pair; A5's "profile notes" read as private notes | A5.1, A13 | Phase 4, item 8; Phase 4.1 |
| DR-4 | Recommended (a): product-defined jobs and recommendation jobs authorized at product level, with notification preferences and an opt-out; user monitors authorized one by one | A14 | Phase 5, item 6; Phase 5.2; the jobs of Phases 6, 8, 10, 11 |
| DR-5 | Recommended (a): dismissal silences the item's key; a separate "not interested" rejects the inference | A15 | Phase 5, item 3; Phase 5.2 |
| DR-6a | Recommended (a): `searchWeb` and `sendEmail` no longer offered; code kept until no stored conversation needs it or after a migration; Composio email tools unaffected | A16 | Phase 1, step 5; Phase 3.1, item 2 |
| DR-6b | Recommended (a): web-only tracking, suggestion and opportunity tools hidden from chat; infrastructure kept for books monitors | A17 | Phase 3.1, item 2; Phase 5.1 |
| DR-7 | Recommended (a): page-answered, server-validated question, continuing the same turn; deviation listed in GUIDE.md | A18 | Phase 3.1, items 3, 7; Phase 2 |
| DR-8 | Recommended (a): optional, user-started onboarding; never interrupts a request | A19 | Phase 4, item 9 |
| DR-9 | Recommended (a): explicitly stated stable facts saved without a request, with a visible notice and undo; uncertain readings stay inferences | A20 | Phase 3.1, item 6; Phase 4, item 10 |
| DR-10 | Recommended (a): one setup card for every monitor creation or resumption; none for pause or stop | A21 | Phase 3.2, item 2; Phase 5.1 |
| DR-11 | Recommended (a): learning on by default, visible, with a switch that disables it and deletes inferences | A22 | Phase 4.1 |
| DR-12 | Recommended (a): 90-day expiry without new evidence; rejection keeps only a topic suppression key | A23 | Phase 4.1, item 3 |
| DR-13 | **Not the recommended option.** No numerical cap on recommendations (daily, weekly or other count), and no configurable cap in its place; relevance filtering, deduplication, dismissal and expiry kept; no authorization check removed and no permission granted | A24 | Phase 5, item 3; Phase 5.2, item 2 |
| DR-14 | Recommended (a): consequence- and origin-based authorization (§2.7); application actions start with the assistant's settings and notification preferences, then accounting actions under their cards and backend permissions | A25 | Phase 3.1, item 4; Phase 3.2 |

### 7.1 Decision register as raised on 2026-11-14 (history and rationale)

Kept as it was raised, for the reasoning behind each decision. Its "baseline until decided" and "recommended" columns describe the situation **before** approval; the resolution table above and §1 are what apply now. DR-13's proposed numerical cap was **not** adopted.

| ID | Existing requirement (source) | Proposed change (source) | Why they differ | Baseline until decided | Options (recommendation marked) | Blocks |
|---|---|---|---|---|---|---|
| DR-1 | A4: documents found in email are linked **automatically**, then reported; linking is reversible and the expense still needs approval. §2.2 jobs act in the background | The superseded proposal allowed background runs to write only their own records (scan runs, notifications) | A blanket restriction would forbid A4's approved automatic linking | A4 as approved; no other unattended writes are planned | (a) **Recommended:** a background run acts only under a recorded standing authorization (A4: connecting an inbox authorizes import and linking for that inbox), only with reversible actions, and reports what it did; anything else becomes a proposed action in a notification. (b) Keep the blanket restriction and revise A4. (c) No rule beyond each job's description | Phase 5, item 5; Phase 7's job; Phase 11's `accountant-daily-prep` |
| DR-2 | A6: memory holds only the person's preferences and way of working; business facts go to the profile table, "never both" (Phase 4, item 4) | The proposal listed explicit business facts ("my accountant handles VAT") under memory, with a business subject | Business facts in memory contradict A6; and the profile table does not exist yet, so a fact stated today has nowhere approved to go | A6; until Phase 4 the template's memory tools save what the model chooses, which can include business facts | (a) **Recommended:** keep A6. Before the profile exists, a business fact the user asks to remember is saved as memory marked `kind: business_fact` and moved to the profile in Phase 4 (one place at a time). (b) Decline to save business facts until Phase 4 and say why. (c) Change A6 to allow business facts in memory | Phase 3.1 item 6 (business facts only); Phase 4 items 1, 4, 8 |
| DR-3 | §2.4: the owner and every accountant whose delegation covers the business see the profile. A5: the agent's data, **including profile notes**, belongs to the pair (actor, client) | The proposal put all knowledge, inferences and notifications under the pair | §2.4 and A5 already disagree for the profile; the proposal adds nothing that settles it | Neither is built. A5 governs every agent table built so far (§2.3, as built) | (a) **Recommended:** split them. Business facts (the profile) are per business, readable under the delegation, with the actor recorded on each fact. Personal memory, inferences, chats and an accountant's own notes about a client stay with the pair. Update A5's wording to "personal notes". (b) The pair owns everything, profile included (amend §2.4). (c) The profile is shared and memory too | Phase 4 items 1, 8; Phase 4.1 |
| DR-4 | §2.2: product-defined jobs (bank watch, advance-tax watch, deadline reminders, accountant briefs) read in the background without a user-created monitor | The proposal treated authorized monitors as the only basis for background reads and alerts, and added recommendation jobs | The rule would forbid §2.2's jobs; and recommendation reads have no authorization defined | §2.2's jobs as planned; no recommendation job exists | (a) **Recommended:** two classes. Product-defined jobs (§2.2, and any listed recommendation job) are authorized at product level, with per-user notification preferences and an opt-out. A user's own monitors (Phase 5.1) are authorized individually. Both stay inside A5 and access checks. (b) Every background read needs a per-user opt-in. (c) Recommendations only from data already read in the user's chats | Phase 5.2; Phases 6, 8, 10, 11's jobs (wording only) |
| DR-5 | None existing | The proposal: dismissing a recommendation also rejects the inference behind it | Dismissing one item ("not now") is not the same as "not interested in this topic" | Nothing built | (a) **Recommended:** dismissal silences that item's key for its period; a separate "not interested" action rejects the inference. (b) Dismissal also rejects the inference | Phase 5, item 3; Phase 5.2 |
| DR-6a | §3.10 and §2.1: remove `searchWeb`, `sendEmail`, their ports and `research-brief`; Phase 1, step 5 | The proposal: keep them registered so stored conversations still validate, but stop offering them | Stored messages are validated against the tool set; removal can break or reclassify old conversations | Not removed; still offered to the model | (a) **Recommended:** stop offering them now; delete their code once no stored conversation uses them, or after a migration of stored parts. (b) Delete now, with tolerant validation of unknown tools. (c) Keep them | Phase 1, step 5; Phase 3.1, item 2 |
| DR-6b | §2.2: user-defined tracking tasks "stay available"; exposing them in the KeepInTax UI is a UI-spec decision | The proposal: stop offering web-only tracking tasks in chat until books monitors exist | Web-only tasks are not what KeepInTax users mean by monitoring, and the agent may create one as a substitute | Available, default `allow` (code) | (a) **Recommended:** keep the infrastructure; stop offering the web-only tracking, suggestion and opportunity tools in chat until Phase 5.1 provides books sources. (b) Keep offering them, with the S10 rule in the prompt. (c) Remove the feature | Phase 3.1, item 2; Phase 5.1 |
| DR-7 | A1: do it the template's way; §3.1: `askUserQuestion` keeps its template behavior | Validated continuation in the same turn: the page answers the tool, and the server accepts only an open question's own values (§2.6) | A change to a template harness contract; A1 allows KeepInTax changes when listed in GUIDE.md | Template behavior: `{ asked: true }`, the label as the next message | (a) **Recommended:** the page answers the tool, applied like approvals; listed as a KeepInTax change. (b) Keep the template's tool, and send the value with a reference to the question as a structured part of the next message. (c) Template behavior plus buttons only | Phase 3.1, item 3; S2's validated continuation |
| DR-8 | Phase 4: `needsOnboarding` drives a pop-up (user 1); the `keepintax-onboarding` skill is the onboarding conversation | Onboarding never interrupts an ordinary request; the user starts it | A pop-up on entry is agent-initiated; the skill must not start inside an unrelated question | Phase 4 as written (not built) | (a) **Recommended:** offer onboarding as an optional notification or entry the user opens, and run the skill only when the user starts it. (b) Keep the pop-up, dismissible, outside the chat. (c) Both | Phase 4, items 2–3 |
| DR-9 | Phase 4 evals: "a later 'I started working from home' updates the facts"; the template memory rule saves stable facts the user states | The proposal: an explicit request authorizes a save | Saving without a request is learning from a statement; the proposal did not say whether that is allowed | The template rule and the Phase 4 eval | (a) **Recommended:** a first-person statement of a stable fact may be saved without a request, with a visible "saved" note and an undo; anything uncertain becomes an inference (§2.8). (b) Save only on request. (c) Ask each time | Phase 4, items 5, 8; its evals |
| DR-10 | None in the plan. Code: `createTrackingTask` defaults to `allow` (`agent-action-rules.ts:44`) | Every monitor needs one setup card | Ongoing background work deserves confirmation; a card on every monitor may be redundant when the user said everything | Code default `allow` | (a) **Recommended:** one setup card showing the parameters the assistant resolved, for every monitor; pausing and stopping without one. (b) Create directly when the user stated every parameter, a card otherwise. (c) The user's action rule decides, default `allow` | Phase 3.2; Phase 5.1 |
| DR-11 | None | Learning from interactions on by default | Usefulness against privacy and surprise | Off: nothing is built | (a) **Recommended:** on by default, visible, with a switch that turns it off and deletes what was inferred. (b) Off until the user turns it on | Phase 4.1; Phase 5.2 |
| DR-12 | None | Inferences decay after 90 days without new evidence; rejected topics kept as suppression keys | How long an unconfirmed belief lives, and what a rejection keeps | Nothing built | (a) **Recommended:** 90 days; a rejection keeps only the topic, so it is not inferred again. (b) Shorter or longer retention. (c) Rejections deleted outright | Phase 4.1 |
| DR-13 | None | *(As proposed; **not adopted**: A24 sets no numerical cap.)* At most one recommendation a day and three a week per pair; alerts not capped beyond dedupe | How intrusive recommendations may be | Nothing built | (a) **Recommended:** as proposed. (b) A user setting with that default | Phase 5.2 |
| DR-14 | A9 (approval cards and backend permission for books, money and official documents); code defaults (tasks, settings, memory allowed; deleting tasks and email ask) | Confirmation by consequence and origin (§2.7); the first KeepInTax application actions in chat | The classes and origin rules narrow some current defaults, which is a change of approval policy | A9 and the code defaults | (a) **Recommended:** adopt §2.7's classes; a pressed follow-up or an opened notification cannot start ongoing work without its confirmation; first actions: the assistant's own settings and notification preferences, then A9 actions, each with its card. (b) Keep the code defaults and add only the origin rule. (c) A card for every write | Phase 3.2; Phase 5.1; S5 |

## Appendix A — Diagnostic findings (2026-11-14)

The report: asked in Hebrew "how much did I spend on fuel this year?", the assistant asked about preferences for future searches. It then called `queryExpenses` (year to date, search "דלק"), got `BUSINESS_REQUIRED`, called `askUserQuestion`, and the page showed raw tool input and output (`{ "asked": true }`) instead of buttons.

**How it was checked:** reading code at `new-ai-assistant` @ `8ffde33a`, plus one offline rendering of `agentUserContextText` for the default settings row (no model, no database). That rendering produced the gap "what they are looking for (seeking)" and the `<profile_gaps>` section. **Not checked:** the user's actual settings row, the trace, the model's exact wording, whether a skill was loaded. No model calls, evals or database reads were made; runtime behavior is inferred from code.

| # | Finding | Evidence |
|---|---|---|
| F1 | Unsolicited profile questions. The default `user_settings` row (`profile_kind='individual'`, `seeking=''`) yields the gap "seeking", and `<profile_gaps>` asks for it "first, in any chat: before other work". That contradicts its next line ("never held… ask in the same answer"), which matches the reported ask-then-query | `backend/agent/src/agent/core/agent/agent-user-context.ts:36-66`; `backend/agent/backend/shared/mysql/mysql-agent-clients.ts:134`; `backend/scripts/migrations/2026-10-22_agent_harness_schema.sql:42-51` |
| F2 | Reinforcing template behavior: `<missing_details>`, the name request in the memory rules, the small-talk hint, the `new-user-setup` and `research-brief` skills | `agent-instructions.ts:87-89`; `memory/long-term-memory.server.ts:181`; `core/turn/agent-turn-signals.ts:115`; `skills/registry/agent-skills.ts:393-396` |
| F3 | The evals encode F1 (`missing-details.eval.ts:32`, "asks for the missing profile details first, even after a greeting"). The books evals use filled settings, so F1 never shows there. No eval covers several businesses with none active | `tests/evals/agent/conversation/missing-details.eval.ts`; `harness/agent-eval-settings-fixtures.ts:36-45`; `books/query-expenses-businesses.eval.ts` |
| F4 | The dev page shows `askUserQuestion` as raw tool JSON; the template's question card was not ported | `frontend/src/app/pages/dev-agent/dev-agent.page.html:60-76`; `backend/agent/GUIDE.md:83` |
| F5 | `askUserQuestion` returns `{ asked: true }` whatever the page does; options are labels only; the answer comes back as free text; nothing records that a question is open | `tools/conversation/ask-user-question-tool.ts:11-33`; `core/agent/app-agent.ts:82-84` |
| F6 | Follow-ups never show live: the server streams a transient `data-followUpsPending` and expects the page to call `GET …/follow-ups`; the page never does, and never reloads a stored chat (a new id on every load, no resume) | `chat/turn/agent-chat-turn-stream.server.ts:186-192`; `chat/turn/agent-chat-answer-run.server.ts:234-270`; `dev-agent.page.ts:176`; `dev-agent-chat.ts:85-106` |
| F7 | Template capabilities are advertised: the role paragraph (tracking tasks, web search, email), the example `<tasks>` section, the follow-up writer's capability list | `agent-instructions.ts:17,49-55`; `core/turn/agent-follow-up-questions.ts:96` |
| F8 | Monitoring is web-only (`kind: "web"`), and `createTrackingTask` defaults to `allow`, so "notify me if fuel expenses increase" could become a misleading web task | `tools/tasks/tracking-task-tools.ts:52-55,129-131`; `lib/settings/agent-actions/agent-action-rules.ts:44` |
| F9 | Memory is free text with only `conversation_id`; up to 100 memories go into every request; "only from what the user wrote" is enforced only by the prompt | `memory/long-term-memory.server.ts:17,71-100,162-186` |
| F10 | Notifications exist for the template monitor only (`opportunity`, `task-error`, read state); no dedupe key, evidence, proposed action or dismissal | `lib/notifications/user-notification-persistence.ts:15-26`; the migration's `user_notifications` table |

Paths without a prefix are under `backend/agent/src/agent/`.

## Appendix B — Proposal history and preservation checklist

**History.** The interaction model was first written on 2026-11-14 as a separate proposal (`docs/plans/ai-agent-interaction-model-plan.md`), after an earlier chat-only draft. It is consolidated here; that file is now only a pointer. Superseded ideas, which are not instructions:
- Per-turn scopes (`answer`, `remember`, `monitor_setup`, `settings`) that decided which tools existed. Dropped: every supported capability is reachable from ordinary chat (§2.5, §2.7).
- Not persisting inferences. Reversed: they are persisted with provenance (§2.8), as approved in DR-11 and DR-12 (A22, A23).
- Background runs writing only their own records. Replaced by DR-1 (A11), which keeps A4's automatic linking.
- "Knowledge, inferences and notifications all belong to the pair". Replaced by DR-3 (A5.1, A13).
- "Dismissing a recommendation rejects its inference". Replaced by DR-5 (A15).
- Monitors as the only basis for background reads. Replaced by DR-4 (A14).
- The proposal's defaults (D1–D6 there) became DR-10, DR-11, DR-13, DR-14, DR-3 and DR-8. All were approved on 2026-11-14 except the proposal's recommendation cap (D3, DR-13): there is no numerical cap (A24).

**Decisions recorded 2026-11-15.** The product owner approved DR-1 to DR-14 on 2026-11-14: the recommended option for each, except DR-13 (no numerical cap). They are recorded in §1 (A5.1, A11–A25) and in §7's resolution table. §7.1 keeps the register as raised, and the text of the plan was reconciled to the decisions rather than annotated. Every "BLOCKED ON DR-n" marker was removed. The remaining blockers are of other kinds: RULES PENDING (including the first recommendation rules and their relevance criteria, added to §5), credentials and providers (§5), and phases not yet built.

**Where each part of the proposal went:**

| Proposal section | Destination here |
|---|---|
| Header, status and evidence basis | Status, the build-status table, Appendix A |
| 1. Product model | §2.5 |
| 2. Confirmed findings F1–F10 | Appendix A (unchanged in substance, with its verification limits) |
| 2. Reusable infrastructure | §2.6 (approvals as the model), §2.7 (guard, `assertAccessStillHolds`, traits, rules), §2.9 (`user_notifications`), Phase 5 |
| 3. What changed from the earlier draft | Appendix B, history |
| 4.1 Interaction origin | §2.7, item 4 (recording: Phase 3.1; rules: DR-14) |
| 4.2 Action policy and idempotency | §2.7, items 3 and 6; Phase 3.1, item 5; Phase 3.2; DR-10, DR-14 |
| 4.3 Blocking clarification | §2.6; §3.1; Phase 3.1, item 3; Phase 2's remaining items; DR-7 |
| 4.4 Optional follow-ups | §2.6; Phase 2's remaining items; Phase 3.1, item 1 |
| 4.5 Honest capability boundary | §2.6; §2.10; §3.10; Phase 3.1, item 2; DR-6a, DR-6b; S10 |
| 5. Knowledge layers, inference sources, retrieval, business profile | §2.8; Phase 4, items 5–10; Phase 4.1; DR-2, DR-3, DR-9, DR-11, DR-12 |
| 6. Notifications | §2.9; Phase 5, items 3–6; Phase 5.2; DR-1, DR-4, DR-5, DR-13 |
| 7. Part A (A1–A4) | Phase 3.1 (backend), Phase 2's remaining items (UI) |
| 7. Part B | Phase 3.2 |
| 7. Part C | Phase 4, items 5–10, and Phase 4.1 |
| 7. Part D | Phase 5.1 (on Phase 5's worker, §2.2) |
| 7. Part E | Phase 5, items 3–4 and 6, and Phase 5.2 |
| 7. Migration considerations | Phase 3.1, item 7 (GUIDE.md); §3.10 (stored messages); Phase 4, item 5, Phase 4.1, item 1, Phase 5, item 3 (dated migrations, registry, never `synchronize`, A8); each phase's task file (§4) |
| 8. Acceptance scenarios S1–S10 | §6.1 |
| 9. Product decisions D1–D6 | §7 (DR-10, DR-11, DR-13, DR-14, DR-3, DR-8) |

**What was kept, and what changed in the existing text:**
- Kept word for word: §1 (A1–A10); §2.1–§2.4 including the data-scoping "as built" record and its 2026-11-05 revision; §3.2–§3.9; "Phase 3 as built"; Phases 0–13 with their steps, tests, evals and "done when" lines; §5's rows; §6's rows and the paid-run rule.
- Changed: the status line (no build claim changed) and the date line; the build-status table is new and lowers no recorded status. It states, from code, that Phases 1 and 2 are only partly built.
- Additions, each dated 2026-11-14: a note under §2.2, a note under §2.4, §3.1's list of proposed changes, §3.10's status note, Phase 2's status, Phase 4's items 5–8, Phase 5's items 3–5, Phases 3.1, 3.2, 4.1, 5.1 and 5.2, a §5 row, two §6 rows, §6.1, §7 and these appendices.
- At consolidation (2026-11-14), no approval requirement, permission or data visibility was changed; every narrowing or widening the proposal suggested was held in §7.
- After the approvals (updated 2026-11-15), these are the changes of policy, each from a decision:
  - A5 is clarified by A5.1.
  - §2.1's removal wording follows A16, and Phase 1, step 5 has an A16 note.
  - §2.2's tracking-task bullet now hides the web-only tools from chat while keeping the infrastructure (A17), and its 2026-11-14 note became the A11/A14 authorization text.
  - §2.4's visibility bullet adds A5.1, and `needsOnboarding` offers a user-started entry instead of driving a pop-up (A19); the 2026-11-14 note became the A12 bullet.
  - §2.5–§2.10, §3.1's list and §3.10's note state the approved policy.
  - §3.2's skill line adds "only when the user starts onboarding" (A19).
  - Phases 3.1, 3.2, 4 (items 8–10), 4.1, 5 (items 3, 5–6), 5.1 and 5.2 lost their decision blockers.
  - A §5 row was replaced and one added; a §6 row was added; S2, S5 and S7 were reworded, and S11–S15 added.
  - Phase 4's original items 1–4, its evals, and Phases 0–3 and 6–13 are unchanged.
