---
name: docs-app-map
description: Investigate the whole codebase and write/update topic-organized AGENTS.md files (one per top-level module directory) plus a root AGENTS.md index, so existing functionality is discoverable before starting new feature work. Use only when explicitly requested (e.g. /docs-app-map) — this is a heavy, whole-codebase pass, not something to run casually.
disable-model-invocation: true
---

# App Topic Map

## When to activate

Only on explicit request (`/docs-app-map` or equivalent). This does a full-codebase investigation — don't run it speculatively.

## What counts as a topic

One topic per top-level module directory, e.g. `backend/src/bookkeeping/`, `backend/src/expenses/`, `backend/src/reports/`, `frontend/src/app/pages/pnl-report-journal/`, `frontend/src/app/shared/category-management/`. Skip generic infra dirs (`common`, `utils`, `shared` wrappers with no domain logic of their own) unless they contain enough real logic to warrant it — use judgement, and note ambiguous cases to the user rather than guessing silently.

## Process

1. Scan `backend/src/*` and `frontend/src/app/**` for candidate topic directories.
2. For each one lacking a `AGENTS.md`, or where the existing one looks stale against current code, read the key files (entities, services, controllers, components) well enough to summarize:
   - **Purpose** — what this module is responsible for, in a sentence or two.
   - **Key entities/files** — the main classes/files and what they hold.
   - **Main flows** — the primary operations/endpoints/user flows this topic implements.
   - **Related topics** — other topic dirs this one depends on or is depended on by.
3. Write that as `<topic-dir>/AGENTS.md` using the four sections above. Keep it tight — this is oriented at "what exists" not a full spec.
4. Update the root `AGENTS.md` with a short index: one line per topic, linking to its directory, e.g. `- [Bookkeeping](backend/src/bookkeeping/AGENTS.md) — journal entries, account seeding, ledger posting`. Create the root file if it doesn't exist yet.
5. Report which topic docs were created vs. updated, and flag any directory you weren't sure counted as its own topic.
