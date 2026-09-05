# Keepintax task dashboard

Last updated: 2026-09-06. This file is maintained by the manager chat.

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
| KT-006 | Add opt-in backend startup profiling and a reproducible dev baseline | `.codex/worktrees/ec9f/taxmyself-dev` | `MANAGER_REVIEW` | Worker commit `0c4df5cc` from base `1e404e47` | Measurement only; manager is reviewing instrumentation, guards, tests, and build before integration |

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

## Delivery baseline

After KT-001 through KT-003, local `main`, `origin/main`, and
`codex/integration` were verified at `28320a01`. Pushing code is not production
deployment; production actions remain separately approved.
