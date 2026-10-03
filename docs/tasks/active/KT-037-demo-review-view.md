# KT-037 - Treat admin-entered demo as regular review user

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\.codex\worktrees\kt037\taxmyself-dev`
- Branch: `codex/kt-037-demo-review-view`
- Base commit: `643ad225`

## Business outcome

An administrator viewing a demo account from the admin panel sees the expense
review exactly as a regular client: regular view only and no view selector.

## Acceptance criteria

- [x] A demo view-as session suppresses professional review access even when
  the real actor is an administrator.
- [x] The demo account is forced to regular mode and cannot switch through a
  direct component method call.
- [x] Normal administrators and accountants outside demo view retain both
  review modes.
- [x] Focused assertions and the Angular production build pass, and topic
  documentation describes the demo exception.

## Scope and constraints

- In scope: report-review view-mode demo exception, focused tests, docs.
- Out of scope: other demo permissions, backend authorization, schema,
  accounting/report calculations, deployment.
- Required reading: root workflow and report-review topic documentation.
- Approval boundaries: the user explicitly clarified this demo UX behavior.

## Handoff

- Result: complete
- Commit hash(es): pending local commit
- Changed files: report-review view-mode helper/spec/page, report-review topic
  documentation, and this task file.
- Tests and exact results: focused TypeScript compile exit 0; 8 direct Node
  assertions passed; Angular production build exit 0 with existing
  budget/style/CommonJS warnings.
- Known pre-existing failures: the legacy Karma suite compile blocker recorded
  in KT-036 remains unrelated; no new failure encountered.
- Schema / production / security / accounting / external impact: frontend UX
  restriction only; no schema, production, backend authorization, accounting,
  or external-contract change.
- Risks and manual checks: enter the seeded demo from Admin Panel and confirm
  report-review shows regular columns with no selector; exit demo and confirm
  the same admin can again select professional view.
- Documentation updated: `frontend/src/app/pages/report-review/AGENTS.md` and
  this task file.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
