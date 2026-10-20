# KT-078 - Designer demo sandbox

- Status: `PUSHED`
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

- Result: Complete. Admin Demo Data can create the isolated designer sandbox; only that identity receives full self-reset, and its Open-Banking graph is synthetic/provider-blocked.
- Commit hash(es): `101d811b`
- Changed files: demo profile/registry/controller/service and tests; users/delegation/transactions authorization and tests; Angular dashboard reset UI, accountant route guard, shared user capability, routing; seven topic `AGENTS.md` updates.
- Tests and exact results: focused backend Jest — 6 suites, 21 tests passed; backend `npm run build` passed; frontend `npm run build` passed with existing style/bundle/CommonJS warnings.
- Known pre-existing failures: focused Angular `ng test --watch=false --browsers=ChromeHeadless --include=src/app/shared/guard/accountant-route.guard.spec.ts` did not execute because the test target compiles unrelated legacy specs and fails on their removed `async` helper/component-name mismatches plus existing missing Node typings. This failure mode is recorded in `docs/coordination/LESSONS.md`; Angular production compilation passed.
- Schema / production / security / accounting / external impact: no schema, production, deployment, tax, or accounting changes. Security is narrowed within the approved scope: regular users can no longer load the accountant client-list endpoint/panel, and self-reset is capability-gated. Designer login/manual sync/retry cannot call Feezback.
- Risks and manual checks: after delivery, create `designer-sandbox` in Admin Panel > Demo Data, sign in with the displayed credentials, confirm seeded bank/card rows, alter data, reset from My Account, and verify the original fixture returns. No live provider or production data is used.
- Documentation updated: backend demo-data/users/transactions/delegation and frontend my-account/demo-data/guards topic maps.

## Integration

- Reviewed by: Codex primary integration manager; full source diff, authorization boundaries, `git show --check`, and generated-file exclusions reviewed.
- Integrated commit: code/docs through `f6f39927` on `codex/integration-kt078`; final delivery record is the following documentation commit.
- Combined verification: backend focused Jest 6 suites / 21 tests passed; Nest build passed; Angular production build passed with pre-existing budget/CommonJS warnings. The known Angular test-target compilation debt is recorded in Handoff.
- `origin/main` verification: delivery command and remote SHA verification completed as part of this PUSHED record; no production deployment.
- User-visible run instructions: Admin Panel > Demo Data > "סביבת עבודה למעצבת" > Create. Sign in using the credentials displayed on that card. The self-reset action appears on My Account only for this profile.
