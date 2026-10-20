# KT-083 - Partner-candidate couple demo

- Status: `APPROVED`
- Task manager: Codex primary manager
- Worker: Codex primary manager
- Worktree: pending
- Branch: `codex/kt083-partner-candidate-demo`
- Base commit: `71dd1782`

## Business outcome

A prospective partner can sign in to an isolated regular-user demo account and
explore realistic synthetic Open Banking data for a married couple with two
businesses, two bank accounts, and three credit cards from January 2026 onward.

## Acceptance criteria

- [ ] Register one new primary demo login with only the `REGULAR` role, no
      delegated clients, no admin/accountant capability, and no self-reset.
- [ ] Model Shani as a licensed-dealer owner and her spouse as an exempt-dealer
      owner, with one primary and one spouse Open Banking identity.
- [ ] Seed exactly two bank sources and three credit-card sources, all synthetic
      and protected from real Feezback calls.
- [ ] Provide varied fixed-date transactions spanning January 2026 through the
      current fixture date, including income, expenses, transfers, fees,
      refunds, recurring charges, equipment, tax payments, and foreign currency.
- [ ] Fixed transaction dates remain stable across future seed/reset runs.
- [ ] Focused Jest checks and the Nest backend build pass.

## Scope and constraints

- In scope: demo profile/type/seeder support, registry, focused tests, and local
  demo-data topic documentation.
- Out of scope: live provider connections, production data, schema changes,
  delegation, admin/accountant roles, and self-service reset.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`,
  `backend/src/demo-data/AGENTS.md`, and `backend/src/transactions/AGENTS.md`.
- Approval boundaries: stop if implementation requires schema, authorization,
  or external-provider contract changes.

## Handoff

- Result:
- Commit hash(es):
- Changed files:
- Tests and exact results:
- Known pre-existing failures:
- Schema / production / security / accounting / external impact:
- Risks and manual checks:
- Documentation updated:

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
