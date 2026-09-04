# Coordination

## Purpose

Defines the mandatory operating model for parallel Codex chats and Git
worktrees in Keepintax. The objective is fast parallel delivery without file
overwrites, stale-base integration, undocumented decisions, or unsafe pushes.

## Key files

- `WORKFLOW.md` — exact manager and worker procedure from intake through push.
- `TASKS.md` — durable, user-readable task dashboard and status vocabulary.
- `AUTHORITY.md` — actions the manager may take automatically and approval gates.
- `LESSONS.md` — failures observed in real runs and the rule preventing each one.

## Main flow

The manager records an approved task, synchronizes the integration base, opens
one isolated worktree, and supplies acceptance criteria. The worker implements,
tests, documents locally, and returns one or more commit hashes without pushing.
The manager reviews and integrates commits one at a time, runs combined checks,
fast-forwards clean `main`, pushes, verifies remote refs, updates `TASKS.md`, and
removes the completed worktree only after the commit is reachable from
`origin/main`.

## Related topics

- Root `AGENTS.md` — global repository and redesign constraints.
- `docs/redesign/categories-redesign-master-plan.md` — binding accounting and
  reporting redesign decisions.
- `docs/redesign/worklog.md` — shared redesign log, updated by the manager for
  delegated parallel work.
