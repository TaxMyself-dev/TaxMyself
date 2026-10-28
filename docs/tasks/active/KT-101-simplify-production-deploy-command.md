# KT-101 - Simplify production deploy command

- Status: `COMPLETE - ready for local commit`
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `ae21cbd2`

## Business outcome

Replace the plan/apply ceremony with one obvious production command whose
default is a full release and whose only target selector is `backend` or
`frontend`.

## Acceptance criteria

- [x] `scripts\deploy` starts a full guarded production release.
- [x] `scripts\deploy backend` deploys only the backend component.
- [x] `scripts\deploy frontend` deploys only the frontend component.
- [x] Plan/apply switches and the environment confirmation gate are removed.
- [x] Preflight, deployed-environment smoke checks, and rollback remain intact.
- [x] The optional local-test skip remains available without bypassing
  production safety gates.
- [x] Documentation and fixture-backed regression tests use the new command.

## Constraints

- No production execution by Codex.
- Do not weaken readiness, browser smoke, cleanup, or rollback.

## Handoff

- Result: Replaced plan/apply with the extensionless `scripts\deploy` command,
  a full default, and positional backend/frontend targets.
- Commit hash(es): this task's implementation commit
- Changed files: `scripts/deploy.cmd`, `scripts/deploy.ps1`,
  `scripts/tests/deploy.Tests.ps1`, `scripts/AGENTS.md`,
  `docs/operations/production-smoke.md`, and this task file.
- Tests: PowerShell parser; `scripts/tests/deploy.Tests.ps1`; extensionless
  wrapper fixture execution; `git diff --check`.
- Production impact: none; operator must run the resulting command
