# Coordination

## Purpose

Defines the mandatory operating model for parallel Codex chats and Git
worktrees in Keepintax. The objective is fast parallel delivery without file
overwrites, stale-base integration, undocumented decisions, or unsafe pushes.

## Key files

- `WORKFLOW.md` — exact manager and worker procedure from intake through push.
- `AUTHORITY.md` — actions the manager may take automatically and approval gates.
- `QUALITY_GATES.md` — required evidence before integration and push.
- `PRODUCTION_POLICY.md` — production, schema, credential, and deployment rules.
- `LESSONS.md` — failures observed in real runs and the rule preventing each one.
- `MANAGER_STATE.md` — compact handoff state owned by the primary integration manager.
- `../tasks/` — one file per active task and an annual closed-task archive.

## Main flow

The task manager records an approved task, synchronizes its base, opens one
isolated worktree, and supplies acceptance criteria. The worker implements,
tests, documents locally, and returns commit hashes without pushing. The task
manager reviews the result. The primary integration manager integrates reviewed
commits one at a time, runs combined checks, fast-forwards clean `main`, pushes,
verifies remote refs, updates the task file and `MANAGER_STATE.md`, and removes
the completed worktree only after the commit is reachable from `origin/main`.
Routine commands run in the current worktree without pre-emptive escalation.
When the platform genuinely requires permission, use a stable, narrow command
prefix rather than a full PowerShell command containing changing paths, hashes,
messages, or file lists; the exact rules and incident-report format are in
`WORKFLOW.md` under Technical permission discipline.

## Editing ownership

- Workers edit task-local code and the nearest topic `AGENTS.md` only when the
  implementation changes documented behavior.
- A task manager edits only the task file it owns.
- The primary integration manager owns this directory, annual task archives,
  and shared redesign worklogs.
- Never change governance rules opportunistically inside a feature or bug-fix
  commit.

## Related topics

- Root `AGENTS.md` — global repository and redesign constraints.
- `docs/redesign/categories-redesign-master-plan.md` — binding accounting and
  reporting redesign decisions.
- `docs/redesign/worklog.md` — shared redesign log, updated by the manager for
  delegated parallel work.
