# Keepintax task dashboard

Last updated: 2026-09-08. This file is maintained by the manager chat.

## Status vocabulary

`APPROVED` → `DISPATCHED` → `IN_PROGRESS` → `WORKER_COMPLETE` →
`MANAGER_REVIEW` → `INTEGRATED` → `VERIFIED` → `PUSHED` → `CLOSED`.

`BLOCKED` may replace any active state and must name the required decision or
external condition.

## Current tasks

| ID | Task | Worker worktree | State | Result / commit | Verification |
|---|---|---|---|---|---|
| KT-001 | Admin access to expired client accounts | `.codex/worktrees/14cc/taxmyself-dev` | `CLOSED` | `dc2fda37` on `origin/main` | 60-test combined backend run included billing/auth guards; Nest and Angular builds passed |
| KT-002 | Issued documents ordered by `docDate DESC, id DESC` | `.codex/worktrees/8c93/taxmyself-dev` | `CLOSED` | `bae142fb` on `origin/main` | Focused query test passed in combined backend run; Nest build passed |
| KT-003 | VAT report eligibility and business selection | `.codex/worktrees/7596/taxmyself-dev` | `CLOSED` | `28320a01` on `origin/main` | Worker focused Angular tests passed; combined Angular build passed; broad Karma compilation has documented pre-existing failures |
| KT-004 | Investigate slow backend startup and propose solutions | `.codex/worktrees/94e5/taxmyself-dev` | `CLOSED` | Research complete; no code commit | Build 53-159s vs direct TypeScript 16-17s; warm module load 3.2-5.5s; boot seed ~3.5s; recommendations documented |
| KT-005 | Fix admin CardCom subscription editing | `.codex/worktrees/b9a0/taxmyself-dev` | `CLOSED` | `9505ea0a` on `origin/main`; worker `0211d9d6` | 10 focused backend tests passed; Nest and Angular builds passed; focused Karma compile exposed only documented pre-existing legacy failures |
| KT-006 | Add opt-in backend startup profiling and a reproducible dev baseline | `.codex/worktrees/ec9f/taxmyself-dev` | `CLOSED` | `156aba28` on `origin/main`; worker `0c4df5cc` | 3 profiler-guard/supervisor tests and 11 timing/seed tests passed; Nest build passed; no production/prodcopy call or behavior optimization |
| KT-007 | Audit the existing SHAAM invoice-allocation integration and plan the shortest safe path to production | `.codex/worktrees/0607/taxmyself-dev` | `CLOSED` | `d3c30f9b` on `origin/main`; worker `bf155e84` | Documentation-only audit reviewed; Nest build passed in worker; no external SHAAM call; critical credential/logging/auth gaps require remediation before sandbox or production |
| KT-008 | Preserve foreign-currency expense values and ILS journal totals during edit | `.codex/worktrees/e5cd/taxmyself-dev` | `CLOSED` | `04bcf4a1` on `origin/main`; worker `aa5febee` | Manager reran 28/28 focused backend tests, Nest build, frontend currency typecheck, and 4 runtime assertions; VAT-only and changed-FX journal totals explicitly verified |
| KT-009 | Deliver Gmail forwarding verification for business inbound addresses | manager integration worktree | `PUSHED` | Feature `ba655334`; integrated with current main via `d56e65af` | Combined 23/23 focused tests passed; Nest and Angular builds passed |

## KT-005 acceptance criteria

- In the CardCom subscriptions admin drawer, the regular accountant plan and
  the accountant plan that includes open banking have distinct labels derived
  from stable plan identity or module data, even when their stored display
  names are identical.
- The drawer's save action uses the application's existing black button style.
- When an administrator saves a future trial-end date for a
  `TRIAL_EXPIRED` subscription, the backend atomically changes its status back
  to `TRIAL`; ordinary users cannot call the admin endpoint.
- Editing a future trial end must not activate paid billing, charge a card, or
  mutate paid-period dates. Other subscription statuses must not be changed
  implicitly.
- Focused backend and frontend tests cover the labels, button configuration,
  transition, non-transition cases, and admin authorization boundary. Relevant
  backend and frontend builds must pass.

## KT-006 acceptance criteria

- Add opt-in startup timing, disabled by default, covering total process-to-ready
  time, bootstrap/Nest creation, database-ready milestone, application init,
  listen, catalog-seed phases, and the first request without recording request
  content or personal data.
- Add a cross-platform `npm run profile:startup` workflow that refuses any
  production-looking database target, forces `DISABLE_SYNCHRONIZE=true`, and
  emits repeatable machine-readable plus human-readable timing output.
- Do not optimize or change catalog behavior, query ordering, retries,
  application APIs, billing, accounting outcomes, schema, or data in this task.
- Do not connect to production or `keepintax_prodcopy`. Runtime measurement may
  use only an explicitly configured `keepintax-dev`; otherwise test the profiler
  guards and document the unmeasured portion.
- Add focused tests for disabled/default behavior, timing output, one-time first
  request measurement, seed-phase instrumentation, and production-target
  refusal. Run relevant backend tests and the Nest build.
- Commit only source, tests, package-script changes, and documentation; exclude
  timing output, caches, dependencies, secrets, and build artifacts.

## KT-007 acceptance criteria

- Map the current backend and frontend SHAAM OAuth and invoice-allocation flows,
  including endpoints, DTOs, token storage/encryption, business scoping,
  environment configuration, error handling, document integration, and every
  currently disabled/manual path.
- Compare the implementation with current official Israel Tax Authority/SHAAM
  documentation for both test and production environments. Record dated source
  links, required registration, scopes, redirect rules, credentials, request
  fields, response/error handling, and any environment differences.
- Establish what can be verified locally with unit/build checks and provide an
  exact, reversible manual test script for the SHAAM test environment, including
  expected evidence at each step and safe cleanup. Never print or commit secrets.
- Produce a prioritized gap/risk list and the shortest staged plan to a real
  production allocation number, clearly separating code work, configuration,
  Tax Authority onboarding, user actions, and explicit approval gates.
- Do not connect to or call SHAAM production, test production credentials,
  request credentials, change external contracts, alter code/schema/data, or
  enable the currently disabled automatic flow. A test-environment call is
  allowed only if already configured safely and it does not require exposing
  credentials or bypassing an interactive user authorization step; otherwise
  document the test procedure without executing it.
- Commit only the audit/report documentation and any task-local evidence that
  contains no secrets, tokens, personal data, generated output, or caches.

## KT-008 acceptance criteria

- Editing a foreign-currency expense prefills the original amount and currency
  from raw API fields rather than parsing a formatted table value.
- A VAT-only or date-only edit preserves the historical ILS conversion and
  performs no FX lookup; changing the original amount or currency converts
  exactly once before persistence.
- Switching an expense back to ILS clears the original-currency metadata, while
  the ordinary ILS edit path remains unchanged.
- D10 period locking applies before any FX lookup or persistence, and a missing
  rate fails before either the expense or its journal entry is written.
- Journal synchronization always receives the normalized ILS amount, including
  the preserved ILS total on VAT-only edits and the newly converted total when
  FX inputs change.
- No database schema, migration, production data, or historical-data repair is
  included in this task.

## KT-009 acceptance criteria

- A Gmail forwarding-verification message sent to a business's Keepintax inbound
  address is relayed automatically to the authenticated owner's registered
  account email; the customer does not need Mailgun access or a temporary route.
- Relaying is restricted to Google's forwarding-verification sender and a
  recognized HTTPS Google Mail confirmation URL. Untrusted links and arbitrary
  attachment-free messages are never relayed.
- Existing PDF/JPG/PNG attachment imports remain unchanged, including tenant
  resolution, signature verification, deduplication, and Mailgun retry behavior.
- Delivery failure returns a retryable server error to Mailgun; logs and the
  relayed message do not expose Firebase IDs, business numbers, or raw inbound
  HTML.
- The settings screen explains where the verification message will arrive.
- Focused backend tests cover success, non-Google rejection, unsafe-link
  rejection, owner lookup, and unchanged attachment import. Nest and Angular
  builds must pass. No schema, production configuration, route, credential, or
  live webhook change is included.

## Delivery baseline

After KT-001 through KT-003, local `main`, `origin/main`, and
`codex/integration` were verified at `28320a01`. Pushing code is not production
deployment; production actions remain separately approved.
