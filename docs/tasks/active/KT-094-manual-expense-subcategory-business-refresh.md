# KT-094 - Refresh manual-expense sub-categories per business

- Status: `VERIFIED`
- Task manager: Codex primary integration manager
- Worker: Codex primary integration manager (single-agent task)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `ea0ee4e2ceeac0f761431203b873a3dd2873d61d`

## Business outcome

The manual-expense dialog loads the fixed-asset and other sub-category options
for the currently selected business, including users who own multiple
businesses.

## Acceptance criteria

- [x] No sub-category request is issued until both a category and business are selected.
- [x] Selecting or switching a business reloads sub-categories even when the category name is unchanged.
- [x] Focused frontend regression coverage compiles cleanly; the Karma runner is blocked by documented unrelated legacy spec failures.
- [x] Angular production build passes.

## Scope and constraints

- In scope: the manual-expense sub-category resource, focused tests, and local topic documentation.
- Out of scope: database/catalog changes, production deployment, and unrelated manual-expense behavior.
- Required reading: root instructions, categories redesign master plan, manual-expense topic documentation.
- Approval boundaries: no schema, accounting, authorization, or API-contract changes.

## Handoff

- Result: the sub-category resource now waits for a selected business and
  reloads whenever the business changes, even when the category is unchanged.
- Commit hash(es): local task commit reported in the delivery message.
- Changed files: manual-expense service/spec/topic documentation and this task file.
- Tests and exact results: focused TypeScript compilation passed; Angular
  production build passed.
- Known pre-existing failures: focused Karma invocation compiles the repository's
  full legacy spec set and stops on existing Node-typing and stale-class-name
  failures before running the included spec.
- Schema / production / security / accounting / external impact: none.
- Risks and manual checks: visually confirm fixed-asset options after selecting
  each of a multi-business user's businesses.
- Documentation updated: `frontend/src/app/components/mannual-expense/AGENTS.md`.

## Integration

- Reviewed by: Codex primary integration manager.
- Integrated commit: local task commit reported in the delivery message.
- Combined verification: focused TypeScript compilation and Angular production build passed.
- `origin/main` verification: not pushed from this dirty user checkout.
- User-visible run instructions: restart/reload the dev frontend, open manual
  expense entry, select either business, enable fixed assets, and open the
  sub-category picker.
