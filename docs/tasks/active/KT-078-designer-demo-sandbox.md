# KT-078 - Designer demo sandbox

- Status: `APPROVED`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:/Users/harel/.codex/worktrees/kt078/taxmyself-dev`
- Branch: `codex/kt-078-designer-demo-sandbox`
- Base commit: `30893c020d8b4bebf84eedd29cfd0547202722fd`

## Business outcome

An administrator can create a dedicated designer demo account from Admin Panel > Demo Data. The designer signs in through the normal email/password flow, sees realistic synthetic open-banking data, and can restore only her own sandbox data. The account cannot access administration, accountant client data, or trigger real open-banking synchronization.

## Acceptance criteria

- [ ] Admin Panel > Demo Data lists a dedicated designer profile and can create it through the existing demo-user workflow.
- [ ] The profile uses a valid-looking synthetic email, is Firebase email-verified, has only the regular-user role, and has no delegation relationships.
- [ ] Seeding creates realistic synthetic bank/card sources, transactions, and completed synchronization state without requiring a live open-banking provider.
- [ ] The backend exposes an explicit self-reset capability only for the designer profile; other demo and regular accounts receive `403` from the self-reset endpoint.
- [ ] The authenticated designer can reset only the currently authenticated sandbox, without accepting a target user ID.
- [ ] A self-reset control is visible only to that capable account and provides confirmation, loading, success, and failure feedback.
- [ ] The designer account is blocked from both the admin panel and the accountant client panel, with backend authorization protecting client-list data.
- [ ] Manual open-banking sync/retry actions for the designer sandbox do not call Feezback.
- [ ] Focused backend/frontend tests pass, and both Nest and Angular production builds pass.
- [ ] Relevant topic `AGENTS.md` documentation is updated before the implementation commit.

## Scope and constraints

- In scope: demo profile registry/data, capability-based self-reset authorization, designer-facing reset UI, accountant-area authorization, demo external-sync protection, tests, and topic documentation.
- Out of scope: database schema changes, production data access, deployment, real bank consent, real Feezback calls, and redesign of the general demo-data system.
- Required reading: root `AGENTS.md`; `docs/coordination/WORKFLOW.md`; `docs/coordination/AUTHORITY.md`; `docs/coordination/QUALITY_GATES.md`; `docs/coordination/LESSONS.md`; `docs/coordination/PRODUCTION_POLICY.md`; `docs/redesign/categories-redesign-master-plan.md`; and the topic `AGENTS.md` files for demo-data, users, transactions, delegation, my-account, demo-data UI, and frontend guards.
- Approval boundaries: user explicitly approved implementation with "לך על זה". No schema, accounting-policy, production, deployment, or live external-service action is authorized.

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
