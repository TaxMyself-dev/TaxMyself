# KT-074 - Uniform-file submission orchestration

- Status: `WORKER_COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: `ed14ea73e6f8b0e4fc79d51da823e6547ca78d4a`

## Business outcome

An authorized user can prepare a validated uniform-file pair for SHAAM,
receive a stable internal submission record, and safely query its state without
uploading anything to the Tax Authority yet.

## Acceptance criteria

- [x] Generate and validate the existing Windows-1255 INI/BKM pair server-side
      for an authorized business and date range.
- [x] Persist only hashes, byte lengths and safe submission metadata; never
      persist file bytes, OAuth tokens, signed URLs or upload capabilities.
- [x] Reuse an existing submission for an identical business/environment/
      period/artifact pair instead of creating a duplicate.
- [x] Expose authenticated, business-scoped create and status endpoints that
      return only safe metadata.
- [x] Fail atomically when generation or persistence fails and make zero
      external SHAAM calls.
- [x] Add focused service/controller tests, update topic documentation and pass
      the backend build.

## Scope and constraints

- In scope: submission orchestration, DTO validation, authenticated controller
  routes, focused tests, SHAAM topic documentation and this task file.
- Out of scope: schema changes, cutover SQL, upload-links, signed/resumable
  upload, status polling, frontend changes, live SHAAM calls, production data,
  deployment, commit or push.
- Required reading: root instructions, coordination workflow/authority/quality
  gates/lessons, full categories redesign master plan, SHAAM and reports topic
  instructions, KT-061 through KT-063.
- Approval boundaries: preserve existing report/accounting totals and security
  policy; stop if a new schema, accounting or external-contract decision is
  required.

## Handoff

- Result: complete; validated artifacts can be prepared/reused and queried by
  authorized business, with no external SHAAM request.
- Commit hash(es): pending local commit
- Changed files: uniform-file generation context, SHAAM submission service/DTO,
  secure controller/module wiring, focused tests, SHAAM/reports topic docs and
  this task file.
- Tests and exact results: 4 focused Jest suites passed, 36 tests passed,
  0 failed; Nest backend build passed; `git diff --check` passed.
- Known pre-existing failures: Jest still emits the repository's generic
  `--forceExit` open-handle suggestion; no focused test failed.
- Schema / production / security / accounting / external impact: no schema or
  production change; no external request is permitted.
- Risks and manual checks: upload-links, resumable upload and remote polling are
  deliberately absent. The endpoints prepare/status metadata only. No live
  endpoint or production database was exercised.
- Documentation updated: `backend/src/shaam/AGENTS.md`,
  `backend/src/reports/AGENTS.md`, and this task file.

## Integration

- Reviewed by: Codex primary chat (diff, tenant scope, failure atomicity and
  no-external-call boundary reviewed)
- Integrated commit: pending
- Combined verification: focused Jest and Nest build passed locally
- `origin/main` verification: not applicable
- User-visible run instructions: none yet; frontend upload UI remains out of
  scope and the existing ZIP download is unchanged.
