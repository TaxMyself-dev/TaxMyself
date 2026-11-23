# AI agent template: guide (as the template shipped it, 2026-10-22)

> Kept verbatim for reference. How this package differs in KeepInTax (npm, MySQL, Firebase, the Nest backend, no UI yet) is in GUIDE.md.

This is a full, runnable web app built around a production AI agent: the chat UI, the agent's backend, the app shell with sign-in and settings, the database schema, the unit tests, the evals and the e2e journeys. It came out of a real product, with the product's own domain taken out and small example tools put in its place. Clone it, run it, then replace the examples with your domain.

**For a coding agent reading this:** treat every file here as working, reviewed code. Keep the mechanisms, rename what is marked `EXAMPLE` (and `YourApp`), and read the comment at the top of each file before changing it: it says why the file is the way it is, often with the measurement behind it.

## Quick start

1. Install [Bun](https://bun.sh), then `bun install`.
2. Create a Supabase project and run `supabase/migrations/` on it (`supabase db push` with the Supabase CLI, or paste the SQL into the SQL editor). Turn on email sign-in.
3. Copy `.env.example` to `.env.local` and fill in the required keys: `OPENAI_API_KEY`, `TYPESAFE_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `SUPABASE_SECRET_KEY`.
4. `bun run generate-i18n`, then `bun run dev`: the app on http://localhost:3000 (English at `/`, Hebrew at `/he`) and the task worker beside it. Sign up at `/app/signup`.
5. Check it: `bun run typecheck`, `bun run check` (lint), `bun run test` (unit tests). `bun run eval` and `bun run test:e2e` call the real model and cost money: see "Running the evals" and "End-to-end journeys".

Rename `YourApp` in `messages/*.json` (`app_name` and the texts around it), in `agent-instructions.ts` and in the prompts that name the app, and replace `public/brand/app-logo.svg`.

## What you get

- **Chat UI:** a ChatGPT-style chat with streaming answers, a live status line, a work log that folds into "worked for 12 seconds", approval cards (approve, deny, deny with a note, always allow), question cards, a plan, follow-up question buttons, link previews with sources, file attachments (images, PDF, Word, Excel, CSV), voice dictation, a chat list with search, pin, rename and download, and Hebrew and English with right-to-left support.
- **Answers that survive the page:** the answer keeps running when the page closes or reloads; reopening the chat follows it live. Only the stop button ends it.
- **Steering:** a message the user sends while the agent works joins the running answer at its next step.
- **Approvals and rules:** risky actions wait for the user's card; the user can set a rule per action (allow, ask, never), in settings, on a card, or by telling the agent.
- **Memory:** long-term memories across chats, the user's settings as context, and long chats folded so the prompt cache keeps working.
- **Tools at scale:** rare tools load on demand (tool search), long results are cut for the model with a way to read the rest, failures tell the model what to do next, and changes run one at a time while reads run side by side.
- **Quality gates:** stop hooks that send an answer back once (open plan steps, a tool search that ended nowhere, an answer claiming something its tools did not do).
- **Tracking tasks and a background monitor:** the user (or the agent) saves a task in one sentence ("find small businesses looking for a bookkeeper in Chicago"); a background worker keeps scanning the task's sources on its schedule, scores every new item with Jev, has the model write what the person wants and why it fits, and records the matches as opportunities with an in-app alert. The UI has a task board and list (drag and drop, filters, sort, bulk actions, a task sheet with its recent scans), an opportunities page, and the same task and opportunity cards inside the chat, with a tasks panel beside it.
- **App shell:** sign-up, log-in and password recovery (Supabase auth), a sidebar with the agent's chats, a notifications bell, a settings dialog (profile, appearance with light and dark themes and the language, goals and preferences, automation with the agent's action rules, the agent's memory), and the agent, tasks and opportunities pages.
- **Evals:** the real agent and model against an in-memory database, with LLM judges, repeated runs, confidence intervals and train/test splits.
- **Harnessing:** a loop that proposes changes to the agent's instructions and tool descriptions, rolls each candidate on eval cases, and keeps what measurably helps (`tests/evals/harnessing`).
- **Real-chat mining and judging:** pull real conversations from the database or Langfuse, mask names, phones, emails and ids, and judge them with Jev to find failures to turn into eval cases (`tests/evals/traces`).
- **End-to-end journeys:** the e2e runner drives the real app in a browser against the real model: chat, steering, follow-ups, chat management, memory, settings, tasks, approvals, scans and opportunities (`tests/e2e`).

## Stack

TypeScript, React 19, TanStack Start on Nitro (routes and server functions), the Vercel AI SDK 7 (`ToolLoopAgent`, `useChat`), OpenAI's Responses API (`gpt-6-luna`), Effect 4 (services, errors, schemas), Supabase (Postgres with row level security, auth), Tailwind 4 with the design system's tokens (`src/styles/base`), paraglide for English and Hebrew, Vitest and DeepEval for tests and evals, the `e2e` runner for browser journeys, Ultracite (Oxlint and Oxfmt) for lint and format, Langfuse for traces, PostHog for product analytics. TypeSafe's Jev for fast judgments: the turn signals, the answer check, the monitor's scoring and the eval judges. Optional: Soniox for dictation.

Versions are pinned in `package.json` (`ai` 7.0.148, `@ai-sdk/openai` 4.0.99, `@ai-sdk/react` 4.0.152, `effect` 4.0.5, `@supabase/supabase-js` 2.118.0, `vitest` 5.0.5, `deepeval` 0.9.23, `e2e` 0.21.2). The type-check runs on TypeScript 6 (`bun run typecheck`) and the lint's type-aware rules on TypeScript 7 native; both must pass.

## Map of the source

```
  src/agent/                  the agent's backend
    core/agent/               app-agent.ts (the agent), agent-instructions.ts, agent-user-context.ts
    core/model/               the model, prompt cache, privacy, adaptive reasoning, retries, telemetry, usage
    core/tool-runtime/        tool registry and traits, approvals, error next steps, output cuts, tool search, queueing, null repair
    core/turn/                stop hooks, plan gate, turn gates, answer check (its rules in agent-answer-check-rules.ts), turn signals, follow-up questions, namespace rules
    core/ports/tracking-task-ports.ts   the task and opportunity tools' ports (stores)
    core/ports/example-ports.ts   EXAMPLE: the tools' ports to the outside world
    chat/turn/                the chat endpoint (agent-chat-endpoint.server.ts), the answer (agent-chat-response.server.ts opens it, agent-chat-answer-run.server.ts runs it), lease, stream, resume, stop, steer, follow-ups, page data
    chat/messages/            storage, model history, attachments, earlier results
    chat/conversations/       chat list, titles
    memory/                   short-term (long chats) and long-term memory
    skills/                   playbooks the agent loads on demand (EXAMPLE playbooks)
    tools/conversation/       generic tools: plan, question, memory, rules, settings, attachments, earlier results, app knowledge
    tools/tasks/              tracking tasks, scans, suggested tasks, opportunities
    tools/examples/           EXAMPLE domain tools: web search, email
  src/components/agent-chat/  the chat UI (page and session, composer, messages, work log, approval cards, tool results, task and opportunity cards, tasks panel)
  src/components/layout/      the app shell: sidebar with the chats, header, notifications, account menu
  src/components/auth/        sign-up, log-in and password recovery
  src/components/settings/    the settings dialog and its sections
  src/components/tasks/       the task board and list, toolbar, task sheet and create dialog, scan runs
  src/components/opportunities/   the opportunities page and its item cards
  src/lib/agent-chat/         the chat's client state, persistence, queue, steering, dictation
  src/lib/tasks, src/lib/opportunities, src/lib/notifications   their schemas, atoms (client state) and server functions
  src/server/tasks/           task and opportunity storage (the pages and the agent's ports share it)
  src/routes/api/agent/       the HTTP endpoints
  src/routes/                 the root document, /app (signed-in layout and auth pages), the agent, tasks and opportunities pages, /auth/callback
  src/server/runtime/         the server's services (app-runtime.server.ts), the user's Supabase client, queries
  src/server/integrations/    Langfuse traces, PostHog product events, Soniox
  src/styles/                 the chat's, tasks', opportunities' and UI parts' CSS
  backend/monitor/            the background monitor: sources, scan, scoring
  backend/worker/task-worker.ts   the worker process that runs the monitor
  src/server/agent-ports.server.ts   EXAMPLE: the ports' real implementations (connect your providers here)
  src/components/ui, src/lib, src/server/runtime, backend/shared   the shared pieces the agent uses (UI parts, database client, runtime, helpers)
  messages/en.json, he.json   the UI texts the chat uses
  supabase/migrations/        the agent's, tasks' and settings' tables, row level security and functions
  tests/src/, tests/backend/  unit tests
  tests/evals/                the eval runner, harness, judges and example evals; harnessing/ (the harness loop); traces/ (mining and judging real chats)
  tests/e2e/                  the e2e journeys and their support (the app server, the tester's data)
  .env.example                every environment variable, required ones first
```

The design system comes with it: the tokens and base styles (`src/styles/base/tokens.css`: colors as `--card`, `--border`, `--foreground`, `--primary`, `--secondary`, and for the opportunity scores `--score-high-*`, `--score-medium-*`, `--score-low-*`), light and dark themes, and the UI parts (`src/components/ui`, `src/styles/ui`). Paint it with your brand by changing the tokens; the components read only them. Generated files are not committed: paraglide's output (`src/paraglide`, `bun run generate-i18n`) and TanStack's route tree (`src/routeTree.gen.ts`, written by the dev server and `bun run generate-routes`).

## How one answer runs

1. **The page sends only the newest message** (`agent-chat-transport.ts`) to `POST /api/agent/chat`. The server holds the conversation.
2. **The endpoint** (`agent-chat-endpoint.server.ts`) checks the origin, content type and session; the answer (`agent-chat-response.server.ts`) then, in one database round trip, creates the conversation if new, takes the answer lease (one answer per chat at a time) and marks the answer's stream active (`claim_agent_chat_answer`). Meanwhile Jev reads the user's words for turn signals (depth, kind).
3. **History** is read, validated against the tools, folded if long (`short-term-memory.server.ts`), and turned into model messages (`agent-chat-model-history.ts`): times on user messages, cut-off tool calls marked aborted, denied approvals explained, notes and steers placed where they were read.
4. **The agent** (`app-agent.ts`) runs a tool loop. Before each step, `prepareStep` reads any steer the user sent, adds the rules of tool namespaces now in use, raises reasoning effort if the work grew, and on the last allowed step turns tools off so the answer always ends with words.
5. **Tools** run through three wrappers: failures gain a next step (`agent-tool-error-next-step.ts`), changes and approvals queue one at a time (`agent-tool-exclusive-runner.ts`), and rare tools are deferred behind OpenAI's tool search (`agent-tool-search.ts`). Approval is decided per call from the tool's effect and the user's rules (`agent-tool-approval.ts`).
6. **The stream** goes to the page and, chunk by chunk, into `agent_chat_stream_chunks`, so a reloaded page replays and follows it (`GET .../stream`).
7. **When the answer ends**, the stop hooks may send it back once with a note (`agent-stop-hooks.ts`); then it is saved, usage recorded, the lease released, and follow-up questions written in the background and fetched by the page (`GET .../follow-ups`). The run itself (`agent-chat-answer-run.server.ts`) takes hooks for another channel (a messaging app): the answer once saved, and its follow-ups once written.

## Tracking tasks and the monitor

A tracking task is one sentence plus what only the user knows (details, place, budget), a list of up to 10 **sources**, a scan frequency (2 minutes to a day) and alerts. Empty fields inherit the user's preferences (`seeking`, `offer`, `notRelevant`, `areas`).

**One scan** (`backend/monitor/scan/task-monitor.ts`, every minute in the worker):

1. **Claim.** `claim_due_tracking_tasks` takes due active tasks with a lease (`FOR UPDATE SKIP LOCKED`), so several workers can run and none scans a task twice; a crashed worker's claim expires and its run is closed. Each claim opens a row in `task_scan_runs`.
2. **Read each source** (`TaskSourceReader.read(source, task)`), skip the items the task already scored (`task_scanned_items`), and renew the lease between sources. A failing source is logged and skipped; the next scan tries it again.
3. **Score each new item with Jev** (`task-post-scoring.ts`), one call per item with several questions: how well it fits (a 0-100 level), whether its author is on the right side (asking, not offering), the place, whether it is something the user excluded, and which reply under it fits best. A failed gate caps the score at 50; a match is 70 and up.
4. **Drop repeats** (`task-match-repeats.ts`): the same author posting the same request again is one match (exact text, or Jev when the text differs).
5. **Describe each match** with the model (`task-match-description.ts`): what the person wants and why it fits, in the user's language.
6. **Record** the source's items, scores, matches and alerts in one transaction (`record_task_source_scan`), fenced by `assert_task_scan_claim`: a worker whose lease ran out writes nothing.
7. **Finish** (`finish_task_scan`): a good scan clears the error; a failed one retries after 2, 4, 8 ... minutes, never later than the task's frequency, and alerts once per new error.

**To connect your sources,** write a `TaskSourceReader` layer (`backend/monitor/sources/task-source.ts`): dispatch on `source.kind` to your own clients (an API, a database query, a scraper), each returning `TaskItem`s with an `id` that stays the same across scans. Describe your kinds and their filters in `createTrackingTask`'s `sources` field (`tracking-task-tools.ts`), so the agent sets them up, and replace `TaskSourceReader.exampleLayer` in `backend/worker/task-worker.ts`. The example layer fails every source as not connected.

**Run the worker** beside the web app, never inside a request: `bun backend/worker/task-worker.ts`. It needs `VITE_SUPABASE_URL`, `SUPABASE_SECRET_KEY` (it reads every user's tasks with the service role, and each write names its owner), `TYPESAFE_API_KEY` and `OPENAI_API_KEY`. `TASK_MONITOR=off` runs it without scanning.

**In the app,** the agent manages tasks through `listTrackingTasks`, `createTrackingTask`, `updateTrackingTask`, `deleteTrackingTasks` (asks first), `scanTrackingTaskNow`, `listRecentScans`, `suggestTrackingTasks` (cards the user adds to Suggestions), `listTaskOpportunities` and `changeTaskOpportunityStatus`. The tasks page, the opportunities page and the chat's cards read and write through the same storage (`src/server/tasks`), so they always agree.

## Key mechanisms, and why

- **One table decides each tool's risk** (`agent-tool-traits.ts`): read, ui, external, write, approval. Approval, queueing, "try again" and the answer check all read it, so a new tool states its effect once.
- **Rules per action** (`agent-action-rules.ts`): allow, ask or never, with defaults; anything sent in the user's name can only ask or never. Setting a rule to allow asks the user first.
- **Approval cards show what will really happen** (`agent-chat-approval-text.ts`), built from the call's input, never from what the agent wrote.
- **Steering** (`agent-chat-user-steers*.ts`): a message sent mid-answer is stored under the answer's stream; the next step takes it. The page treats a steer as read only when it streams back, and sends any unread one as a normal message after the answer, so none is lost or read twice.
- **Answers outlive the page**: the answer's abort signal is the stop button and the lease, never the HTTP request.
- **Long chats** fold at fixed token steps (48k budget, 16k steps, the 6 newest messages always kept), so the request's start stays the same and the prompt cache keeps hitting; the folded part becomes a list the agent can search (`searchEarlierResults`). No summary model.
- **Instructions are the same for every user and turn**, so OpenAI's prompt cache reuses them; what changes (the time, settings, memories) arrives as messages. A test pins the instructions and caps them at 20,000 characters, and the up-front tools at another 20,000.
- **Long tool results are cut for the model** (`agent-tool-output.ts`, about 5,000 tokens) with a note saying how to read the rest; the chat still shows the whole result.
- **Tool errors carry their next step**, keyed by the error's `CODE:` prefix. A change that fails without a known code is "outcome unknown: check before doing it again".
- **The answer check** (`agent-answer-check.ts`, its rules in `agent-answer-check-rules.ts`): Jev reads the answer against what the turn's tools returned; a claimed action with no returning tool, or a fact no tool gave, sends the answer back once to correct itself.
- **Several requests in one message are planned up front** (`agent-turn-signals.ts`): Jev counts the requests; with several, the first step may call `updatePlan` with its reads. Without it the agent did every part but showed no plan in 5 of 6 runs.
- **A harness can be swapped without code changes** (`agent-harness-override.ts`): the agent takes another set of instructions and tool descriptions, which harnessing tries on eval cases; the chat never passes one.

## Lessons we measured (keep them)

- **Follow-up questions written after the answer, not before it ends**, saved 3 to 5 seconds on every answer: the page used to show "working" while they were written.
- **Refused tool calls with `null` fields:** the model sends `null` for a field it leaves empty; a schema that only allows leaving it out refused the call and cost a model step every time. `agent-tool-null-repair.ts` retries without the nulls.
- **Extra steps cost about 1.5 seconds each** (the time to the model's first token). Telling the agent to answer from search results, and to read items in full only when asked, cut searches from about 17 to 9 seconds.
- **Run independent sources side by side, in one step.** Searching several sources one after another made a combined request take 49 seconds; side by side, 25.
- **Writing the agent's instructions shorter** (43% fewer characters) kept the same eval results and cut input tokens 13%. One sentence removed (converting UTC to the user's time zone) broke a time eval: rerun the evals after every instruction change.
- **Reasoning effort:** low for most steps, raised only when the work grows (several steps, a long brief, the user asks for depth). Medium everywhere gave the same quality, one second slower per answer.
- **A sentence in the instructions can break an unrelated behavior.** One about rate limits made the agent ask profile questions instead of searching in half the runs of an unrelated case. Put tool-specific advice in that tool's description, not in the instructions.
- **Sub-agents (a manager with workers) brought no measurable gain** for this kind of product and were removed.
- **Switching models needs an adapter, not just a new model name:** reasoning-effort updates and passing reasoning back differ per provider. Benchmark on your own evals before switching.

## How to adapt it to your product

1. **Connect the tasks' sources** (see "Tracking tasks and the monitor" above), and write the item cards your sources deserve (`task-item-card.tsx` shows any item generically).
2. **Pick your domain tools.** For each, write a tool in `src/agent/tools/<area>/` following `tools/examples/` and `tools/tasks/`: a description in the model's terms, every field described, `toModelOutput` with `agentToolModelOutput` for anything long.
3. **Declare each tool's effect** in `agent-tool-traits.ts`, its title in `agent-chat-tool-text.ts`, its icon in `agent-chat-answer-work.ts`, and add it to `app-agent-tools.ts` and to `toolsContext` in `app-agent.ts` if it uses the context.
4. **Write its ports** in `example-ports.ts` (rename the file) and the real implementations in `src/server/agent-ports.server.ts`; give evals fixed answers in `agent-eval-scenario.ts`. A port's real implementation that calls a service by URL lets the e2e app point it at a fake (`tests/e2e/support/e2e-app.ts`).
5. **Actions that change something** go in `agent-action-rules.ts` (with a default) and `agent-action-labels.ts`; anything sent in the user's name gets `rules: ["ask", "never"]`.
6. **Rewrite the domain parts of the instructions** (`agent-instructions.ts`, marked EXAMPLE): the first paragraph, the tasks section, the scope list. Keep the generic sections.
7. **Rare tools** go in a namespace in `agent-tool-search.ts`, with rules in `agent-namespace-rules.ts` if they need any.
8. **Multi-step flows** become playbooks in `src/agent/skills/playbooks/`, written as a goal, sources and "done when", not as a recipe.
9. **Results with a visual form** get a card in `agent-chat-tool-result.tsx` (`AgentChatToolResult`) and their tool type in `agentChatToolsWithOwnView`; what the page reads again after an answer goes in `agent-chat-answer-end.ts`.
10. **Settings** the agent needs go in `user-settings-schema.ts`, the user context (`agent-user-context.ts`), `updateUserSettings`, and the `user_settings` table.
11. **Database:** add a migration in `supabase/migrations/` for your tables, with row level security, and their types in `src/lib/supabase/` (a table's columns as a `type` or a mapped type, never a bare `interface`: Supabase's types need an index signature, and without one every query's type becomes `never`). Database functions go in `supabase-functions.ts`.
12. **Texts:** add your keys to `messages/en.json` and `he.json` (the example suggestion chips are `app_chat_s*`, the placeholders `app_chat_ph_*`), then `bun run generate-i18n`. Another language is one more file and an entry in `project.inlang/settings.json` and `vite.config.ts`.
13. **Time zone:** the agent reads each message's time in `Asia/Jerusalem` (`agentChatTimeZone` in `agent-chat-model-history.ts`, and the judges' local time in `agent-eval-run-checks.ts`). Set your users' zone there.
14. **Evals first:** for each new behavior, write an eval case (`tests/evals/agent/`) before tuning the instructions, and run it a few times; one run proves little. Each user workflow your agent owns gets an e2e journey too (`tests/e2e/journeys/`).

## Environment variables

- `OPENAI_API_KEY`: the agent's model.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (the publishable key), `SUPABASE_SECRET_KEY` (server only): your Supabase project.
- `TYPESAFE_API_KEY`: Jev, required: the turn signals, the answer check, the monitor's scoring and the eval judges. A failing or slow Jev never blocks an answer (the turn runs without signals, the answer without its check, both logged); `AGENT_TURN_SIGNALS=false` and `AGENT_ANSWER_CHECK=false` turn them off on purpose.
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, `LANGFUSE_SAMPLE_RATE` (optional): traces of every answer, with phone numbers and emails masked.
- `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`, `POSTHOG_HOST` (optional): product analytics in the browser and product events from the server (`posthog-product-events.server.ts`: tasks created, opportunities filed, each agent message and tool used, never what the user typed).
- `SONIOX_API_KEY` (optional): voice dictation.
- `E2E_USER_TESTER_USERNAME`, `E2E_USER_TESTER_PASSWORD` (e2e only): the tester account.
- `JOURNEY_TIMINGS_FILE` (optional): where the speed measurements of the main journeys (a chat's first reply, a task scan) are kept locally.
- `TASK_MONITOR=off` (optional, worker only): runs the worker without scanning.

## Running the evals

`bun run eval --variant <name> --reps 3` (add `-t "approvals"` for some cases) runs the real agent and model against fixtures, with judges, and writes results, Wilson confidence intervals, a summary with each run's cost, and a train/test split per case to `.eval/agent/runs/<name>/`. Compare two variants with `--compare <other>`. Each case runs at the time its messages were written (the clock is pinned), so fixtures do not age. An eval costs model calls: start with a few cases and three runs each.

**Harnessing** (`bun run harness`, after Harness²): for each case that failed in an earlier run, it proposes changes to the agent's instructions and tool descriptions, probes them on the case, picks a final one blind, records the lesson in the area's library, and only then judges the base and the adopted harness on fresh runs. Nothing is changed in the code: each case's `adopted.diff` and a `report.md` wait for a person. Describe your agent's work for it in `tests/evals/harnessing/agent-harness-work.ts`.

**Real chats:** `bun tests/evals/traces/mine-agent-chats.ts` reads the conversations of the users in `AGENT_EVAL_MINE_USER_IDS`, masks them (names, phones, emails, account ids) and writes them to `.eval/agent/mined/` for review; a reviewed one becomes an eval case. `bun --env-file=.env.local tests/evals/traces/judge-agent-traces.ts --write-scores` judges real answers in Langfuse (an answer that gives nothing, a number its tools do not back, an unexplained tool error, a read repeated with the same input) and scores the flagged traces.

## End-to-end journeys

`bun run test:e2e` runs `tests/e2e/journeys/` with the e2e runner: a browser drives its own dev server (port 3100, `tests/e2e/support/e2e-app.ts`) against the real model, and an AI agent (`agent.assert`, `agent.act`) checks what a person would see. The journeys cover the chat (a first answer and its title, a follow-up press, steering a running answer, renaming, searching and deleting chats, memory across chats) and the agent's workflows (missing details saved to settings, a task created, opened and paused, a delete denied then approved, scan now and recent scans, opportunity cards).

Setup: a tester account in your Supabase project (sign it up once in the app), its email and password in `E2E_USER_TESTER_USERNAME` and `E2E_USER_TESTER_PASSWORD`, and `SUPABASE_SECRET_KEY`, which the journeys use to set up and read the tester's data (`tests/e2e/support/tester-data.ts`). Every journey wipes the tester's data before and after it runs: never use a real user. The first run signs the tester in and keeps the session (`tester-sign-in.e2e.ts`). Results and videos go to `.e2e/`; a journey that needs an outside service starts a fake of it in `e2e-app.ts`.

## What changed since the first pack (2026-10-18)

Brought over from the product, without its domain:

- **Runnable app:** `package.json`, configs, the root document, routing, sign-in pages, the app shell, the settings dialog and the design system's styles. English is the base language (`/`), Hebrew at `/he`.
- **End-to-end journeys** (`tests/e2e`), new to the template.
- **Turn signals:** a third question counts the requests in a message; several are planned from the first step.
- **Instructions:** "who am I" answers lead with the user's name from memory and end by asking for it when missing; the scope rule refuses off-topic facts and opinions completely and says a question of fact is never small talk.
- **Follow-up questions:** none when the answer asks the user for something; no placeholders; a length limit for channels whose buttons are short.
- **New-user playbook:** loads before the agent's first question, and leaves task ideas to `suggestTrackingTasks`.
- **Stop hooks:** a hook's rerun reads the whole run's messages (AI SDK 7 keeps only one step's messages in a step), so results of tools the user approved are no longer lost.
- **Harness override, harnessing, and real-chat mining and judging**, described above.
- **More eval cases:** planning, skills, missing details, tracking tasks, task opportunities, the setup workflow, the judges' self-tests, real chats and simulated users (five workflows played by a simulated user who changes their mind or denies a card), rewritten for the example tools; the scenario takes the monitor's recent scans (`scanRuns`), and `evalWebSearch` and `evalOpportunity` are shared fixtures.
- **Evals:** the clock pinned to each case's time; the judges given each tool time's age before the user's message, computed by code; the harness, the answer and the step messages in their own files; a run summary with costs.
- **Splits for readability:** the chat endpoint (endpoint, response, answer run), the answer check (rules, turn text, tool outcomes), the chat page (session, handlers, queued sends, answer end, tool progress), the composer (footer, queued messages), the message (actions), the answer part (tool result), and the chat's CSS (enter motion, question card, source chips).
- **Product events in PostHog** from the server, and a `task_monitor_scans` metric by outcome.
- **Fixed:** the `user_settings` column type was an `interface`, which turned every database query's type into `never` under TypeScript 7.
