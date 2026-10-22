# KT-092 - Business proprietor UI polish

- Status: `VERIFIED`
- Task manager: Codex primary integration manager
- Worker: Codex (single-agent isolated worktree)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt092-worker`
- Branch: `codex/kt092-business-proprietor-ui`
- Base commit: `0db387a6`

## Business outcome

The business Settings form remains readable without overlapping fields, and
the proprietor selector identifies each spouse only by their full name rather
than account-role terminology.

## Acceptance criteria

- [x] Proprietor options show only the primary and spouse names when present.
- [x] Missing-name fallback does not use primary/secondary account-role copy.
- [x] Existing-business fields use a responsive layout without overlap on
      desktop, tablet, or mobile widths.
- [x] Focused frontend tests and the Angular production build pass.
- [x] Settings topic documentation describes the presentation rule.

## Scope and constraints

- In scope: Settings proprietor-option labels, business-card field layout,
  focused tests and documentation.
- Out of scope: proprietor persistence, database schema/backfill, reports,
  production deployment, or other Settings tabs.
- Approval boundary: Elazar supplied the failing UI screenshot and explicitly
  requested the name-only proprietor labels and layout correction.

## Handoff

- Result: Name-only proprietor options and a responsive business-field grid
  are implemented.
- Commit hash: `48ca6d9e` (worker).
- Changed files: proprietor option helper/spec, Settings template/styles,
  Settings topic documentation, and this task file.
- Worker tests: deferred because the clean worktree had no local npm executable
  or dependencies; all required checks passed during manager integration.
- Risks and manual checks: the 220px grid minimum matches the existing Settings
  control width; the grid collapses to one column at 768px.
- Documentation updated: `frontend/src/app/pages/settings/AGENTS.md`.

## Integration

- Reviewed by: Codex primary integration manager.
- Integrated commit: `9fd51ce3`.
- Combined verification: focused TypeScript check passed; focused Karma passed
  3/3; Angular production build passed with existing budget/CommonJS warnings.
- `origin/main` verification: pending push.
