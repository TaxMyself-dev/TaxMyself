# Keepintax documentation map

This directory contains durable product, engineering, and delivery knowledge.
Chat transcripts and temporary investigation dumps do not belong here.

## What is binding

Use this precedence when two documents appear to disagree:

1. Root and nearest-directory `AGENTS.md` files define working instructions.
2. `coordination/` defines the shared delivery process and approval boundaries.
3. `redesign/categories-redesign-master-plan.md` overrides older accounting and
   category documentation while that redesign is in progress.
4. Current code and tests define implemented behavior.
5. `features/` explains implemented behavior; `plans/` and `research/` are
   proposals or dated evidence and are not implementation authority.

Record a real contradiction in the active task file and stop only when it
changes an approved business, accounting, security, schema, or production
decision. Do not silently choose whichever document was opened first.

## Structure and ownership

| Location | Purpose | Editor |
|---|---|---|
| `coordination/` | Shared workflow, authority, quality gates, production policy | Primary integration manager, in a dedicated docs task |
| `tasks/active/` | One file per current task | That task's manager |
| `tasks/archive/` | Compact completed-task history | Primary integration manager |
| `team/` | Non-secret roles and developer profiles | Primary integration manager |
| `features/` | Implemented feature behavior and operations | Worker or manager changing that feature |
| `operations/` | Development/runtime diagnostics and runbooks | Owner of the affected operation |
| `plans/` | Unapproved or not-yet-complete designs | Task owner; mark status explicitly |
| `research/` | Point-in-time audits and findings | Research task owner; include an audit date |
| `architecture/` | High-level visual orientation | Feature owner when the pictured flow changes |
| `redesign/` | Binding accounting redesign plan, cutover evidence and worklog | Rules in `redesign/README.md` |

Topic-specific development guidance lives beside the code in `AGENTS.md`.
Personal preferences and secrets remain outside the repository.
