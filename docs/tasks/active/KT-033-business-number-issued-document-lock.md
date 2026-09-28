# KT-033 - Lock business-number changes only after document issuance

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary
- Worker: Codex primary (single-agent execution)
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `662558e4ba7c5b195dcf6b53400e5ca8f1957d4c`

## Business outcome

A business number remains correctable until an official document has been
issued under the existing number. Automatically generated reporting workflows,
accountant tasks, and other business-scoped records do not block the correction.

## Acceptance criteria

- [x] Reject changing a populated business number when at least one issued
  `documents` row uses the existing number.
- [x] Explain in Hebrew that issued documents are the reason for the rejection.
- [x] Allow the change when there are no issued documents, irrespective of
  other business-scoped records.
- [x] Keep duplicate-number protection unchanged.
- [x] Rekey non-document business references and client catalog ownership in
  the same transaction as the business update.
- [x] Cover both allowed and rejected paths with focused tests and pass the
  backend build.

## Scope and constraints

- In scope: business-number update guard, focused tests, topic documentation.
- Out of scope: production data changes, migrations, rewriting existing
  dependent records, deployment.
- Required reading: root instructions, coordination workflow and gates,
  `backend/src/business/AGENTS.md`, `backend/src/documents/AGENTS.md`.
- Approval boundaries: no schema, production, accounting, authorization, or
  external-contract changes.

## Handoff

- Result: complete
- Commit hash(es):
- Changed files: business service/module/spec, business topic documentation,
  this task file.
- Tests and exact results: `business.service.spec.ts` — 8/8 passed; backend
  `nest build` — exit 0.
- Known pre-existing failures: none encountered.
- Schema / production / security / accounting / external impact: no schema,
  production-data, authorization, accounting, or external-contract change.
- Risks and manual checks: deploy and verify a business with workflow/task rows
  but no issued documents can change its number; issued documents still block.
- Documentation updated: `backend/src/business/AGENTS.md`.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
