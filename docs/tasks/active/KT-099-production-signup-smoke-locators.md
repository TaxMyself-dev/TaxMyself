# KT-099 - Harden production signup smoke locators

- Status: `COMPLETE` - committed locally
- Task manager: Codex primary manager
- Worker: Codex primary manager (no delegated worker)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `ca89723f0e21100d896c10f9bf6f3a65ad542aa6`

## Business outcome

Keep the post-deployment production registration smoke aligned with the real
registration UI, and surface a safe, useful smoke failure reason in the
release-script terminal output.

## Acceptance criteria

- [x] Registration fields are located through their visible component labels,
  without relying on Angular's non-contractual rendered directive attributes.
- [x] Registration dropdowns use the same label-based locator strategy.
- [x] Dropdown options that share text require an exact accessible-name match.
- [x] Operators can rerun only signup, verification, login, and cleanup against
  a rolled-back production version without weakening the normal release gates.
- [x] Cleanup disambiguates reused smoke emails by exact run-derived identity,
  deletes legacy module subscriptions, and verifies the expected row deletion.
- [x] Concurrent Drive provisioning cannot recreate a user deleted by cleanup.
- [x] A failed production smoke emits an explicit safe fatal marker that the
  release orchestrator can show instead of only a nested PowerShell exit code.
- [x] Focused smoke tests and release-script fixture tests pass.

## Constraints

- Do not execute a production deployment or a write-capable production smoke.
- Do not print credentials, request payloads, environment values, or arbitrary
  application responses in the concise terminal error.
- Preserve guaranteed synthetic-user cleanup and automatic release rollback.

## Handoff

- Result: registration inputs/selects use exact visible-label locators;
  bounded smoke failure reasons are promoted safely to the quiet console; the
  cleanup/Drive race found by the live operator run is closed locally
- Commit hash(es): this task's implementation commit
- Changed files: signup smoke/locator helper and tests, production release
  orchestrator and tests, smoke/scripts topic docs, and this task record
- Tests: JavaScript syntax checks passed; smoke unit tests passed 10/10;
  backend cleanup/Drive tests passed 12/12; backend production build passed;
  `scripts/tests/Deploy-Production.Tests.ps1` passed; `git diff --check` passed
- Production impact: none; no production command is run by this task
