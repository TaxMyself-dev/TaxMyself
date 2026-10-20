# KT-083 - Partner-candidate couple demo

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary manager
- Worker: Codex primary manager
- Worktree: `C:\Users\harel\.codex\worktrees\kt083\taxmyself-dev`
- Branch: `codex/kt083-partner-candidate-demo`
- Base commit: `25e6bab9`

## Business outcome

A prospective partner can sign in to an isolated regular-user demo account and
explore realistic synthetic Open Banking data for a married couple with two
businesses, two bank accounts, and three credit cards from January 2026 onward.

## Acceptance criteria

- [x] Register one new primary demo login with only the `REGULAR` role, no
      delegated clients, no admin/accountant capability, and no self-reset.
- [x] Model Shani as a licensed-dealer owner and her spouse as an exempt-dealer
      owner, with one primary and one spouse Open Banking identity.
- [x] Seed exactly two bank sources and three credit-card sources, all synthetic
      and protected from real Feezback calls.
- [x] Provide varied fixed-date transactions spanning January 2026 through the
      current fixture date, including income, expenses, transfers, fees,
      refunds, recurring charges, equipment, tax payments, and foreign currency.
- [x] Fixed transaction dates remain stable across future seed/reset runs.
- [x] Focused Jest checks and the Nest backend build pass.

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

- Result: complete
- Commit hash(es): `6b4a098b`
- Changed files: demo profile/types/seeder/registry, synthetic-sync guard tests,
  profile tests, and `backend/src/demo-data/AGENTS.md`.
- Tests and exact results: focused Jest — 6 suites / 30 tests passed; Nest
  backend build passed.
- Known pre-existing failures: none. `npm ci` reported the repository's existing
  dependency audit findings (96 total) without changing the lockfile.
- Schema / production / security / accounting / external impact: no schema,
  production-data, authorization, accounting, or external-provider changes.
  The synthetic profile is explicitly blocked from Feezback login/manual/retry
  paths.
- Risks and manual checks: create the profile from the admin demo-data screen,
  then verify the five sources and both businesses visually. No live seed was
  executed during implementation.
- Documentation updated: `backend/src/demo-data/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
