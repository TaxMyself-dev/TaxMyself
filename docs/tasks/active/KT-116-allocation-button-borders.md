# KT-116 - Allocation flow white-button borders

- Status: `PUSHED`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt116-worker`
- Branch: `codex/kt-116-allocation-button-borders`
- Base commit: `11c829b252fdfe9655af3893e44c756901b3369b`

## Business outcome

Every white-background action in the allocation-number creation and completion
flow has a visible black border.

## Acceptance criteria

- [x] White actions in the create-document allocation decision use the shared black-border variant.
- [x] White actions in the incomes allocation-method and manual-entry dialogs use the shared black-border variant.
- [x] The change is scoped to the allocation flow and does not alter the global white-button style.
- [x] Focused frontend tests and the Angular production build pass.

## Scope and constraints

- In scope: allocation-flow button variants, focused verification, and topic documentation.
- Out of scope: global button styling, allocation behavior, backend/database changes, deployment.

## Handoff

- Result: complete
- Commit hash(es): this task commit
- Tests and exact results: allocation/table Karma 52/52; doc-create Karma
  27/27; Angular production build exit 0 with existing bundle/style-budget and
  CommonJS warnings.
- Risks and manual checks: verify all allocation dialogs visually in light mode.
- Documentation updated: book-keeping and doc-create topic docs plus this task.

## Integration

- Reviewed by: Codex primary
- Integrated commit: `aa549003`
- Combined verification: initial focused Karma suites passed 52/52 and 27/27;
  Angular production build passed before integration and again after rebasing
  onto current `origin/main`. Static verification found no remaining plain
  `WHITE` allocation-flow actions.
- `origin/main` verification: delivery commit `362ec52b` pushed successfully on 2026-11-19.
- User-visible run instructions: reload the frontend and open both allocation
  dialogs; every white action now has a black border.
