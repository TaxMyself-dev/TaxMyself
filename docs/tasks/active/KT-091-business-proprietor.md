# KT-091 - Explicit business proprietor

- Status: `PUSHED`
- Task manager: Codex primary integration manager
- Worker: Codex (single-agent isolated worktree)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt091-worker`
- Branch: `codex/kt091-business-proprietor`
- Base commit: `3980983c`

## Business outcome

Every business in a private household account belongs explicitly to either the
primary user or the spouse. Reports display the selected proprietor's name
instead of assuming that every business belongs to the primary user. Private
accounts continue to support only exempt or licensed sole proprietors, not
companies or partnerships.

## Acceptance criteria

- [x] `business` stores a validated proprietor role (`PRIMARY` or `SPOUSE`).
- [x] Private-account signup assigns each generated business to the person
      whose business section produced it.
- [x] Adding or editing a business in Settings lets a private married account
      choose the primary user or spouse; a missing spouse cannot be selected.
- [x] Company accounts assign their business to the primary account identity
      without presenting a spouse selector.
- [x] Backend create/update/signup validation rejects invalid proprietor roles
      and continues rejecting company/partnership business types for private
      accounts.
- [x] P&L screen/PDF resolves `businessOwnerName` from the business's stored
      proprietor role; business-name display continues to use `businessName`.
- [x] Legacy primary/spouse compatibility fields are mapped by proprietor role,
      not business row order.
- [x] Existing rows are backfilled deterministically: an unambiguous match to
      `user.spouseId` becomes `SPOUSE`; all other rows remain `PRIMARY` to
      preserve current behavior.
- [x] Focused backend/frontend tests and both production builds pass.
- [x] Topic documentation and cumulative cutover SQL describe the new invariant.

## Scope and constraints

- In scope: business entity/DTO/service/signup, Settings and registration
  payloads, report proprietor-name resolution, compatibility mapping, tests,
  documentation, and idempotent schema/data SQL.
- Out of scope: changing report totals, legal/tax calculations, company-account
  registration behavior, production execution, or production deployment.
- Required reading: root `AGENTS.md`; `docs/coordination/WORKFLOW.md`;
  `docs/redesign/categories-redesign-master-plan.md`; nearest business, users,
  settings, register, and reports topic docs.
- Approval boundaries: Elazar explicitly approved the proprietor linkage and
  private-account restriction. Production execution/deployment remains outside
  this task.

## Handoff

- Result: Added explicit primary/spouse proprietor ownership across persistence,
  signup, Settings CRUD, compatibility mapping, demo/delegation creation,
  implicit import routing, and P&L owner-name display.
- Commit hash(es): worker `7b68281f`; integration `29d32ff6`.
- Changed files: business/users/reports/delegation/demo backend paths; register,
  settings, shared frontend contracts; migration/cutover SQL; focused tests and
  topic documentation.
- Tests and exact results:
  - Backend Jest: 4 suites, 20 tests passed.
  - Frontend focused ChromeHeadless (no-GPU launcher): 2 tests passed.
  - Frontend focused TypeScript check: passed.
  - Nest production build: passed.
  - Angular production build: passed with existing size/CommonJS warnings.
- Known pre-existing failures: default ChromeHeadless launcher crashes its GPU
  process in this Windows sandbox; the same compiled bundle passes with GPU and
  software rasterization disabled.
- Schema / production / security / accounting / external impact: adds the
  non-null `business.proprietorRole` enum and deterministic legacy backfill.
  Appended to `docs/redesign/cutover.sql`; not executed against any database.
  No report totals or accounting calculations changed.
- Risks and manual checks: ambiguous legacy rows deliberately remain PRIMARY.
  After cutover, manually confirm the proprietor selector and one spouse-owned
  P&L header against representative production data.
- Documentation updated: business, users, reports, demo-data, Settings, and
  registration topic AGENTS plus cumulative cutover SQL.

## Integration

- Reviewed by: Codex primary integration manager; scope/diff, validation,
  deterministic backfill, documentation, and non-production boundary reviewed.
- Integrated commit: `29d32ff6` on `codex/integration-kt091`.
- Combined verification: Backend Jest 4 suites / 20 tests passed; focused
  frontend TypeScript check passed; Nest and Angular production builds passed.
  The focused frontend ChromeHeadless run already passed 2/2 on the identical
  worker commit with a no-GPU launcher. Angular emitted existing
  bundle-size/CommonJS warnings only.
- `origin/main` verification: `abb2e4bc660f42f1e926f8ad2820676104830ea6`
  confirmed by `git ls-remote`; `origin/codex/integration-kt091` matched the
  same SHA before this final delivery-record commit.
- User-visible run instructions: apply the appended KT-091 section in
  `docs/redesign/cutover.sql` during the approved cutover before starting this
  application version; no SQL was executed by this task.
