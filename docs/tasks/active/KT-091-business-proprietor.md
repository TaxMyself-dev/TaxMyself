# KT-091 - Explicit business proprietor

- Status: `APPROVED`
- Task manager: Codex primary integration manager
- Worker: Codex (single-agent isolated worktree)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt091-worker`
- Branch: `codex/kt091-business-proprietor`
- Base commit: `2834a739cb48cacd0ddc411d1cb08f4008b7329d`

## Business outcome

Every business in a private household account belongs explicitly to either the
primary user or the spouse. Reports display the selected proprietor's name
instead of assuming that every business belongs to the primary user. Private
accounts continue to support only exempt or licensed sole proprietors, not
companies or partnerships.

## Acceptance criteria

- [ ] `business` stores a validated proprietor role (`PRIMARY` or `SPOUSE`).
- [ ] Private-account signup assigns each generated business to the person
      whose business section produced it.
- [ ] Adding or editing a business in Settings lets a private married account
      choose the primary user or spouse; a missing spouse cannot be selected.
- [ ] Company accounts assign their business to the primary account identity
      without presenting a spouse selector.
- [ ] Backend create/update/signup validation rejects invalid proprietor roles
      and continues rejecting company/partnership business types for private
      accounts.
- [ ] P&L screen/PDF resolves `businessOwnerName` from the business's stored
      proprietor role; business-name display continues to use `businessName`.
- [ ] Legacy primary/spouse compatibility fields are mapped by proprietor role,
      not business row order.
- [ ] Existing rows are backfilled deterministically: an unambiguous match to
      `user.spouseId` becomes `SPOUSE`; all other rows remain `PRIMARY` to
      preserve current behavior.
- [ ] Focused backend/frontend tests and both production builds pass.
- [ ] Topic documentation and cumulative cutover SQL describe the new invariant.

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
