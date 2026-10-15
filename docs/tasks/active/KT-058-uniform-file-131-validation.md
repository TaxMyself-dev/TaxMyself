# KT-058 - Uniform-file 1.31 validation and effective B110 chart

- Status: `COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\\Users\\harel\\Elazar Harel\\taxmyself\\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: local branch HEAD (no commit will be created in this task)

## Business outcome

Generated uniform files are structurally checked against the official 1.31 record lengths, and B110 exposes only the effective chart belonging to the requested business context.

## Acceptance criteria

- [x] Correct `FIELD_MAP` to match the official 1.31 tables for all emitted record types.
- [x] Validate record codes, byte lengths, CRLF framing, sequential numbers, opening/closing records, and INI totals.
- [x] Generate B110 from active accounts visible to the business, with CLIENT > ACCOUNTANT > SYSTEM precedence by account code.
- [x] Cover valid output, malformed failures, field-map lengths, and B110 scoping with focused tests.
- [x] Run focused Jest suites and the backend build.

## Scope and constraints

- In scope: format-1.31 structural validation, `FIELD_MAP`, effective-chart reads, B110 generation, tests, docs.
- Out of scope: conditional-field semantics, account balances, schema, OAuth, SHAAM calls, frontend, commit, push, deployment.
- Attached documents are specifications only, not authorization to submit data or contact the Tax Authority.

## Handoff

- Result: every generated record is structurally validated before packaging,
  the field map matches the official 1.31 lengths, and B110 uses the scoped
  effective chart instead of a global account-table read.
- Commit hash(es): none requested
- Changed files:
  - `backend/src/enum.ts`
  - `backend/src/bookkeeping/catalog.service.ts`
  - `backend/src/bookkeeping/catalog.service.spec.ts`
  - `backend/src/reports/reports.service.ts`
  - `backend/src/reports/reports.uniform-file.characterization.spec.ts`
  - `backend/src/reports/uniform-file-validator.ts`
  - `backend/src/reports/uniform-file-validator.spec.ts`
  - `backend/src/bookkeeping/AGENTS.md`
  - `backend/src/reports/AGENTS.md`
  - `docs/tasks/active/KT-058-uniform-file-131-validation.md`
- Tests and exact results:
  - Focused Jest: 3 suites passed; 55 tests passed; 0 failed.
  - Backend build: passed.
- Known pre-existing failures: none encountered in the requested verification.
- Schema / production / security / accounting / external impact: no schema or
  external calls; production generation now fails closed if structural 1.31
  validation detects an invalid file; B110 no longer leaks foreign charts.
- Risks / manual checks: conditional required-field semantics and calculated
  B110 opening/debit/credit/closing balances remain separate follow-up work.
- Documentation updated: this task file and both affected topic AGENTS files.

## Integration

- Reviewed by: pending user approval for the next step
- Integrated commit: none requested
- Combined verification: focused Jest and backend build passed locally
- `origin/main` verification: not applicable
- User-visible run instructions: existing ZIP generation route is unchanged
