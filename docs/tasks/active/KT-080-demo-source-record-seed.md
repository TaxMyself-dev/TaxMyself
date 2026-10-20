# KT-080 - Repair demo source-record seeding

- Status: `APPROVED`
- Task manager: Codex primary manager
- Worker: Codex primary manager
- Worktree: pending
- Branch: `codex/kt080-demo-source-record-seed`
- Base commit: `7a4ac026`

## Business outcome

The designer sandbox and other Open Banking demo profiles can be seeded and
reset after the permanent payment-source identity migration.

## Acceptance criteria

- [ ] Demo source sync-state rows persist the required `Source.id` through
      `sourceRecordId`.
- [ ] Both normal profile seed/reset and the Direct-card scenario writer use
      the permanent source identity.
- [ ] A focused regression test fails if either writer omits or mis-resolves
      `sourceRecordId`.
- [ ] Focused Jest checks and the Nest backend build pass.

## Scope and constraints

- In scope: demo-data sync-state persistence and its focused tests/docs.
- Out of scope: schema changes, production data changes, provider calls, and
  changes to payment-source identity semantics.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`,
  `backend/src/demo-data/AGENTS.md`, `backend/src/transactions/AGENTS.md`, and
  the categories redesign master plan.
- Approval boundaries: stop if the fix would require schema/cutover changes or
  a new source-identity rule.

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
