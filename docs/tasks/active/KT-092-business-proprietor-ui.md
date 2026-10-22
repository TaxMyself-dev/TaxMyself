# KT-092 - Business proprietor UI polish

- Status: `WORKER_COMPLETE`
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
- [ ] Missing-name fallback does not use “primary user” or “secondary user”.
- [x] Existing-business fields use a responsive layout without overlap on
      desktop, tablet, or mobile widths.
- [ ] Focused frontend tests and the Angular production build pass.
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
- Commit hash(es): pending worker commit
- Changed files: proprietor option helper/spec, Settings template/styles,
  Settings topic documentation, and this task file.
- Tests and exact results: deferred to manager integration because this clean
  worker worktree has no local npm executable or dependencies.
- Risks and manual checks: the 220px grid minimum matches the existing Settings
  control width; the grid collapses to one column at 768px.
- Documentation updated: `frontend/src/app/pages/settings/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
