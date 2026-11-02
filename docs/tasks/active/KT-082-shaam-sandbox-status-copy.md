# KT-082 - Clear SHAAM sandbox status

- Status: `PUSHED`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `8c87f125ad944d04bd5f518860b2c442eecdc6e2`

## Business outcome

Settings explains that real businesses cannot be checked or connected while the backend is in the restricted Tax Authority sandbox, instead of presenting the expected restriction as an unknown connection failure.

## Acceptance criteria

- [x] `SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED` is displayed as a dedicated sandbox-limitation status.
- [x] The connect action is disabled for a sandbox-blocked business.
- [x] Other connection-status errors retain the generic failure state.
- [x] Focused frontend tests and the production build pass.

## Scope and constraints

- In scope: Settings status mapping, copy, disabled state, tests, and topic docs.
- Out of scope: backend sandbox allowlist or security behavior, OAuth, production configuration, deployment.
- Required reading: root instructions, coordination workflow, Settings and SHAAM topic docs.
- Approval boundaries: user explicitly approved the copy/UX correction; no external or production mutations.

## Handoff

- Result: complete
- Commit hash(es): `54b975a7`
- Changed files: Settings SHAAM status mapping/template/style/test, Settings topic documentation, and this task record.
- Tests and exact results:
  - Focused Angular/Karma: 1 spec file, 4 tests passed.
  - Angular production build: passed with exit code 0 and existing bundle/style budget and CommonJS warnings.
- Known pre-existing failures: the default test configuration compiles unrelated legacy broken specs; the focused run used a temporary narrowed tsconfig and no-GPU headless launcher, both reverted before delivery.
- Schema / production / security / accounting / external impact: none. The backend sandbox guard remains unchanged; no production access or deployment.
- Risks and manual checks: verify the explanatory text fits on narrow screens and that production still reports connected/disconnected normally.
- Documentation updated: Settings topic doc and this task record.

## Integration

- Reviewed by: Codex primary integration manager
- Integrated commit: `54b975a7`
- Combined verification: 4 focused Angular tests passed; Angular production build passed; staged diff and `git show --check` passed review.
- `origin/main` verification: code delivery `54b975a7` pushed successfully on 2026-10-20; final documentation delivery is recorded by the following commit.
- User-visible run instructions: deploy the frontend from current `main`; in local tsandbox, real businesses should show the explicit sandbox limitation with a disabled connect action.
