# KT-112 - Center billing plans layout

- Status: `APPROVED`
- Task manager: Codex primary integration manager
- Worker: Codex
- Worktree: `C:\Users\harel\.codex\worktrees\kt112\taxmyself-dev`
- Branch: `codex/kt-112-center-billing-plans`
- Base commit: `154b2d45aac107ed4734cf599b98520be58f3ace`

## Business outcome

The plan-selection screen presents its title, available plan cards, and VAT note as one centered, balanced panel on desktop and mobile.

## Acceptance criteria

- [ ] The plans content panel is horizontally centered relative to the full page.
- [ ] The plan-selection title and available plan cards share the same visual center.
- [ ] Two available plans are centered instead of occupying two cells of a three-column grid.
- [ ] The content is enclosed in a subtle bordered surface consistent with the site design.
- [ ] The layout remains readable and centered on tablet and mobile widths.
- [ ] Billing behavior, checkout calls, plan eligibility, and displayed prices are unchanged.

## Scope and constraints

- In scope: billing plans page markup/styles, focused presentation coverage, billing topic documentation.
- Out of scope: billing logic, backend, database/schema/data, production deployment, CardCom behavior.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`, `frontend/src/app/pages/billing/AGENTS.md`.
- Approval boundaries: no schema, production, security, accounting, or external API changes.

## Handoff

- Result:
- Commit hash(es):
- Changed files:
- Tests and exact results:
- Known pre-existing failures:
- Schema / production / security / accounting / external impact: none expected.
- Risks and manual checks:
- Documentation updated:

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
