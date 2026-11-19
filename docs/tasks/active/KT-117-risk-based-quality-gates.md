# KT-117 - Risk-based quality-gate selection

- Status: `PUSHED`
- Task manager: Codex primary
- Worker: Codex primary (dedicated governance-documentation task)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev\_prod_dump\kt117-worker`
- Branch: `codex/kt-117-risk-based-quality-gates`
- Base commit: `98b41022`

## Business outcome

Small presentation-only changes use proportionate verification instead of
automatically running broad unrelated suites, while behavioral and shared
changes retain stronger gates.

## Acceptance criteria

- [x] Quality gates define explicit change-risk tiers and required verification.
- [x] Local HTML/CSS-only changes require targeted evidence plus the frontend build, not unrelated flow suites.
- [x] Shared components, behavior, services, backend, and infrastructure retain appropriately broader verification.
- [x] The workflow tells workers and managers to record the selected tier and rationale.

## Scope and constraints

- In scope: coordination quality-gate and workflow documentation.
- Out of scope: application code, test-runner implementation, CI configuration, production access.
- Required reading: coordination workflow, authority, quality gates, and topic documentation.
- Approval boundaries: user explicitly requested updating the test-selection rules.

## Handoff

- Result: complete
- Commit hash(es): this task commit
- Changed files: quality gates, workflow, coordination topic documentation, and this task.
- Tests and exact results: documentation-only; `git diff --check` and staged-file review required. No application tests/builds apply.
- Known pre-existing failures: no repository Markdown-link command exists; changed text adds no Markdown links.
- Schema / production / security / accounting / external impact: none.
- Risks and manual checks: future tasks must classify event wiring, dynamic classes, shared selectors, and accessibility behavior above the presentation-only tier.
- Documentation updated: coordination governance and task record.

## Integration

- Reviewed by: Codex primary
- Integrated commit: `362ec52b`
- Combined verification: documentation diff review and `git diff --check`
  passed; no application tests/builds apply to the governance-only commit.
- `origin/main` verification: `362ec52b` pushed successfully on 2026-11-19.
- User-visible run instructions: future work is classified by the risk matrix
  in `docs/coordination/QUALITY_GATES.md` before tests are selected.
