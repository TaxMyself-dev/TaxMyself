# KT-031 - Decouple settings tabs from open banking

- Status: `READY_TO_PUSH`
- Task manager: Codex primary integration manager
- Worker: Codex primary agent
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `9a91c4218f5a4057d121902d00144ec9f5eeb56d`

## Business outcome

Every authenticated customer can open “My categories” and manage the people
who have access to their data, regardless of whether their subscription
includes open banking.

## Acceptance criteria

- [x] “My categories” is visible without the `OPEN_BANKING` module.
- [x] “Permissions and accounts” is visible without the `OPEN_BANKING` module.
- [x] Permission listing, granting, and revocation remain available to those users.
- [x] Open-banking account-source loading and UI remain restricted to users with the `OPEN_BANKING` module.
- [x] Frontend documentation and focused tests describe the resulting policy.
- [x] Angular production build succeeds.

## Scope and constraints

- In scope: settings-tab visibility, open-banking subsection gating, focused frontend tests and settings documentation.
- Out of scope: backend authorization, delegation scopes, billing-plan composition, database changes, production deployment.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`, `docs/coordination/AUTHORITY.md`, `docs/coordination/QUALITY_GATES.md`, settings and guard topic docs.
- Approval boundaries: the user explicitly approved removing the `OPEN_BANKING` dependency from both tabs. Existing backend authorization remains unchanged.

## Handoff

- Result: complete
- Commit hash(es): `9e0a08819f893aa1d5fb544d60ffb2d754c11e16`
- Changed files: settings page TS/HTML, settings access policy + focused spec, shared access-control registry, settings topic documentation, this task record.
- Tests and exact results: direct policy execution passed 4/4 critical assertions; Angular production build passed (exit 0).
- Known pre-existing failures: Angular Karma's `--include` run still compiles legacy specs and stopped before execution on existing errors, including removed Angular `async` imports and mismatched component class names.
- Schema / production / security / accounting / external impact: no schema, production-data, accounting, or external-contract impact. UI entitlement policy changes exactly as approved; backend authorization and delegation scopes are unchanged.
- Risks and manual checks: after deployment, confirm both tabs appear for a basic-plan customer and that the open-banking account subsection remains absent for that customer.
- Documentation updated: `frontend/src/app/pages/settings/AGENTS.md`.

## Integration

- Reviewed by: Codex primary integration manager
- Integrated commit: `9e0a08819f893aa1d5fb544d60ffb2d754c11e16` on local `main`
- Combined verification: focused policy execution passed 4/4 assertions; Angular production build passed; `git diff --check` and `git show --check` passed.
- `origin/main` verification: `origin/main` (`9a91c421`) is an ancestor of local `main`; push awaits explicit remote-destination approval.
- User-visible run instructions: after push/deployment, sign in as a customer without `OPEN_BANKING` and verify both tabs appear while the open-banking account subsection stays hidden.
