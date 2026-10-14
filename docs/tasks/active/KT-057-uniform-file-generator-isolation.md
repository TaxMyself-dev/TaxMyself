# KT-057 - Uniform-file generator isolation and raw artifacts

- Status: `COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\\Users\\harel\\Elazar Harel\\taxmyself\\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: local branch HEAD (no commit will be created in this task)

## Business outcome

The existing uniform-file generator can safely support later API uploads by
producing isolated per-request state and exposing the two required encoded text
artifacts while preserving the current ZIP download contract.

## Acceptance criteria

- [x] Replace service-wide uniform-file counters and summaries with explicit
      per-generation state.
- [x] Ensure repeated and concurrent generations each start at record number 1
      and do not share summaries.
- [x] Return Windows-1255 `INI.TXT` and `BKMVDATA.TXT` buffers alongside the
      existing ZIP buffer.
- [x] Preserve the current controller JSON response and ZIP entry layout.
- [x] Run focused Jest tests and the backend build.

## Scope and constraints

- In scope: internal generator refactor, raw artifact return values, focused
  tests, and this task file.
- Out of scope: record-content corrections, B110 chart selection, schema,
  OAuth, SHAAM calls, frontend, migration/cutover SQL, commit, push, deployment.
- Official evidence: the corrected September 2026 Tax Authority presentation
  states that `INI` and `BKMVDATA` are uploaded separately as text files.
- Approval boundaries: preserve all current user-visible output and do not
  initiate external communication.

## Handoff

- Result: uniform-file generation now uses isolated request-local state and
  returns raw encoded artifacts without changing the existing HTTP response.
- Commit hash(es): none requested
- Changed files:
  - `backend/src/reports/reports.service.ts`
  - `backend/src/reports/reports.uniform-file.characterization.spec.ts`
  - `backend/src/reports/AGENTS.md`
  - `docs/tasks/active/KT-057-uniform-file-generator-isolation.md`
- Tests and exact results:
  - Focused Jest: 1 suite passed; 6 tests passed; 2 explicit todos; 0 failed.
  - Backend build: passed.
- Known pre-existing failures: none encountered in the requested verification.
- Schema / production / security / accounting / external impact: no schema,
  external call, or accounting-content change; internal production refactor only.
- Risks / manual checks: B110 effective-chart selection and exhaustive format
  1.31 field validation remain explicit follow-up tasks.
- Documentation updated: this task file and `backend/src/reports/AGENTS.md`

## Integration

- Reviewed by: pending user approval for the next step
- Integrated commit: none requested
- Combined verification: focused Jest and backend build passed locally
- `origin/main` verification: not applicable
- User-visible run instructions: none; existing ZIP download behavior is preserved
