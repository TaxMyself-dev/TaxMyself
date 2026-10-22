# KT-092 - Business proprietor UI polish

- Status: `APPROVED`
- Task manager: Codex primary integration manager
- Worker: Codex (single-agent isolated worktree)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt092-worker`
- Branch: `codex/kt092-business-proprietor-ui`
- Base commit: `ef97d758`

## Business outcome

The business Settings form remains readable without overlapping fields, and
the proprietor selector identifies each spouse only by their full name rather
than account-role terminology.

## Acceptance criteria

- [ ] Proprietor options show only the primary and spouse names when present.
- [ ] Missing-name fallback does not use “primary user” or “secondary user”.
- [ ] Existing-business fields use a responsive layout without overlap on
      desktop, tablet, or mobile widths.
- [ ] Focused frontend tests and the Angular production build pass.
- [ ] Settings topic documentation describes the presentation rule.

## Scope and constraints

- In scope: Settings proprietor-option labels, business-card field layout,
  focused tests and documentation.
- Out of scope: proprietor persistence, database schema/backfill, reports,
  production deployment, or other Settings tabs.
- Approval boundary: Elazar supplied the failing UI screenshot and explicitly
  requested the name-only proprietor labels and layout correction.

## Handoff

- Result:
- Commit hash(es):
- Changed files:
- Tests and exact results:
- Risks and manual checks:
- Documentation updated:

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
