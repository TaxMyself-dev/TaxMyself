# KT-036 - Restrict professional expense-review view

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\.codex\worktrees\kt036\taxmyself-dev`
- Branch: `codex/kt-036-report-review-view-access`
- Base commit: `7e2b5a39`

## Business outcome

Only accountants and administrators can see and choose the professional view
on the expense-review page. Every other user always receives the regular view.

## Acceptance criteria

- [x] Show the view selector only when the real logged-in actor has the
  `ACCOUNTANT` or `ADMIN` role.
- [x] Force every other actor to regular view, ignoring a previously stored
  professional preference.
- [x] Prevent a non-professional actor from switching to professional view
  through the component method and persist only the effective mode.
- [x] Preserve per-user preference and professional-by-default behavior for
  accountants and administrators, including while representing a client.
- [x] Add focused tests, update topic documentation, and pass the frontend
  production build.

## Scope and constraints

- In scope: report-review view-mode role resolution, selector visibility,
  focused tests, and report-review topic documentation.
- Out of scope: backend authorization, expense approval capabilities,
  accounting/report calculations, and the archive approval dialog (which has
  no view selector).
- Required reading: root instructions, coordination workflow/gates, and the
  report-review topic documentation.
- Approval boundaries: the user explicitly approved this role-based UX change.
  No schema, production, or external-service changes are authorized.

## Handoff

- Result: complete
- Commit hash(es): pending local commit
- Changed files: report-review page logic/template, isolated view-mode helper
  and spec, report-review topic documentation, and this task file.
- Tests and exact results: focused TypeScript compile exit 0; 8 direct Node
  assertions passed; Angular production build exit 0 with existing
  bundle/style/CommonJS warnings.
- Known pre-existing failures: Angular's supposedly focused Karma invocation
  compiled the full legacy spec tree and stopped before running tests because
  unrelated specs import removed/renamed symbols and Node typings are excluded.
  The exact command and failures were captured during the task.
- Schema / production / security / accounting / external impact: frontend UX
  role gate only; no schema, production, backend authorization, accounting, or
  external-contract change.
- Risks and manual checks: visually confirm CLIENT sees no selector and regular
  columns; confirm ACCOUNTANT/ADMIN sees the selector, retains preference, and
  remains professional-capable while representing a client.
- Documentation updated: `frontend/src/app/pages/report-review/AGENTS.md` and
  this task file.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
