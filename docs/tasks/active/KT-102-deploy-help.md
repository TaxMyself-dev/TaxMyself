# KT-102 - Deploy command help

- Status: `COMPLETE - ready for local commit`
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `9316a5f9`

## Business outcome

Let an operator discover the production deployment syntax directly from the
command without remembering targets or options.

## Acceptance criteria

- [x] `scripts\deploy -Help` prints usage, targets, options, and examples.
- [x] Help exits successfully without login, cloud access, logs, or deployment.
- [x] The command accepts the short alias `-h`.
- [x] Regression tests and operator documentation cover the help behavior.

## Constraints

- No production execution by Codex.
- Help must run before every deployment side effect.

## Handoff

- Result: Added side-effect-free deploy usage help and a short `-h` alias.
- Commit hash(es): this task's implementation commit
- Changed files: `scripts/deploy.ps1`, `scripts/tests/deploy.Tests.ps1`,
  `scripts/AGENTS.md`, `docs/operations/production-smoke.md`, and this task.
- Tests: PowerShell parser; `scripts/tests/deploy.Tests.ps1`;
  `scripts\deploy -Help`; `scripts\deploy -h`; `git diff --check`.
- Production impact: none
