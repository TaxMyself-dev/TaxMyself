# KT-101 - Quiet production release logging

- Status: `COMPLETE — delivery pending`
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `f5e75b025b94f9c3aefceeb1cd3753569c243638`

## Business outcome

Keep production-release terminal output focused on stage progress and fatal
errors while preserving complete, real-time diagnostics in a durable local log.

## Acceptance criteria

- [x] The terminal prints the log path once, then stage START/COMPLETE status
  and concise failure/safety messages.
- [x] Native command, test, build, warning, and cloud output is streamed to the
  log instead of flooding the terminal.
- [x] The log records stage statuses, full failure records and the final stage
  summary.
- [x] Release logs are git-ignored and do not dirty preflight.
- [x] Plan/failure fixtures and PowerShell parsing remain green.
- [x] No dependency upgrade or production action is part of this task.

## Constraints

- Do not log production environment values or credentials that the existing
  release tooling intentionally redacts.
- Preserve interactive authentication, release safety gates and rollback.

## Verification

- `scripts/tests/Deploy-Production.Tests.ps1`
  - PASS, including quiet terminal, detailed log, failure log and git-ignore
    assertions.
- PowerShell parser checks for the release and smoke setup scripts
  - PASS.
- `node --test tests/config.unit.test.js` from `smoke-tests/`
  - PASS — 8/8 tests.
- Fixture-backed manual plan
  - PASS — terminal contained only log path and stage/plan status; detailed log
    contained hidden INFO and full plan output.
- `git diff --check`
  - PASS (line-ending notices only; no whitespace errors).
