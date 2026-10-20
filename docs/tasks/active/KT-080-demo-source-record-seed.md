# KT-080 - Repair demo source-record seeding

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary manager
- Worker: Codex primary manager
- Worktree: `C:\Users\harel\.codex\worktrees\kt080\taxmyself-dev`
- Branch: `codex/kt080-demo-source-record-seed`
- Base commit: `cd178c15`

## Business outcome

The designer sandbox and other Open Banking demo profiles can be seeded and
reset after the permanent payment-source identity migration.

## Acceptance criteria

- [x] Demo source sync-state rows persist the required `Source.id` through
      `sourceRecordId`.
- [x] Both normal profile seed/reset and the Direct-card scenario writer use
      the permanent source identity.
- [x] A focused regression test fails if either writer omits or mis-resolves
      `sourceRecordId`.
- [x] Focused Jest checks and the Nest backend build pass.

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

- Result: complete
- Commit hash(es): `973400cf`
- Changed files: `backend/src/demo-data/demo-data.service.ts`,
  `backend/src/demo-data/demo-data.service.source-record.spec.ts`,
  `backend/src/demo-data/AGENTS.md`
- Tests and exact results: focused Jest run — 3 suites / 15 tests passed;
  final new-spec rerun — 1 suite / 4 tests passed; Nest build passed.
- Known pre-existing failures: none. Initial build execution was sandbox-blocked
  from creating `backend/dist`; the identical escalated rerun passed.
- Schema / production / security / accounting / external impact: none. No
  schema, production-data, authorization, accounting, or provider API changes.
- Risks and manual checks: re-run the `designer-sandbox` seed after integration.
- Documentation updated: `backend/src/demo-data/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
