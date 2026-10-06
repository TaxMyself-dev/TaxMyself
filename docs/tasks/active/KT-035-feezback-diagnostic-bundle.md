# KT-035 - Feezback V2 bank pulls and diagnostic bundle

- Status: `INTEGRATED`
- Task manager: Codex `/root`
- Worker: Codex `/root`
- Worktree: `C:\Users\harel\Elazar Harel\taxmyself\taxmyself-dev`
- Branch: `main`
- Base commit: `0c201a24d370729d3c4b869fc3611a2c06c2b8fb`

## Business outcome

An administrator can pull Feezback transactions through V2 for both bank and
card sources, inspect one coherent diagnostic record, spot likely provider-side
duplicates, and prepare a redacted support package without collecting evidence
manually from SQL, DevTools, and separate JSON panels.

## Acceptance criteria

- [x] Bank transaction pulls use the explicit Feezback V2 consent/account URL;
      discovery calls may remain on V1 and there is no silent V1 transaction
      fallback.
- [x] The admin pull response identifies the diagnostic run, exact sub and user
      identifier, request range, timestamps, API version, source resource and
      consent IDs, HTTP outcome, raw/extracted/normalized transactions,
      persistence result, and errors.
- [x] Same-source transactions with distinct provider IDs but an otherwise
      identical diagnostic fingerprint are surfaced as suspected duplicates
      without changing or deleting transaction data.
- [x] The admin dialog presents the diagnostic hierarchy clearly and can copy a
      ready-to-send Feezback support message or download/copy the complete JSON
      bundle.
- [x] Important diagnostic values are displayed as separate label/value rows;
      the redacted complete JSON remains available to inspect, copy, or download.
- [x] The Feezback dialog and generated support message use English/LTR labels,
      and timestamps are shown as unambiguous ISO 8601 UTC values.
- [x] Backend terminal output omits Feezback URLs, response bodies, retry chatter,
      and persistence banners; an admin pull logs only a compact per-source result.
- [x] Authorization and secret values remain redacted from every exported form.
- [x] The dialog provides a diagnostic-only pull that does not persist
      normalized transactions or source sync status.
- [ ] Focused backend/frontend tests and both builds pass before handoff for
      manual testing.
- [x] No commit is created until Elazar completes the requested manual test and
      explicitly asks for it.

## Scope and constraints

- In scope: Feezback bank/card transaction fetch orchestration, admin diagnostic
  response contract, suspected-duplicate analysis, admin dialog presentation and
  export helpers, focused tests and local topic documentation.
- Out of scope: automatic deletion/merging of transactions, direct email/ticket
  delivery to Feezback, production access or deployment. At the user's request,
  Section 18's already-approved snapshot columns/index and cache backfill were
  applied to `keepintax-dev` only so transaction persistence could be tested.
- Required reading: root `AGENTS.md`, `backend/src/feezback/AGENTS.md`,
  `backend/src/transactions/AGENTS.md`, `frontend/src/app/pages/admin-panel/AGENTS.md`,
  and `docs/coordination/WORKFLOW.md`.
- Approval boundaries: no production access; no external message is sent; no
  commit before the user's manual test.

## Handoff

- Result: implementation complete; Elazar completed manual review and explicitly
  approved creating the local commit on 2026-10-03
- Commit hash(es): none pending manual test
- Changed files: Feezback V2 bank orchestration and admin diagnostics; admin
  diagnostic response types; Feezback transaction dialog UI/export; focused
  backend/frontend specs; Feezback topic docs; this task file.
- Tests and exact results: backend focused Jest 2 suites / 15 tests passed; Nest
  build exit 0; Angular production build exit 0. The isolated Angular test
  command did not execute tests because the repository-wide test compilation
  fails first on legacy specs and missing Node types.
- Known pre-existing failures: Angular test compilation reports legacy spec
  imports for renamed components, removed Angular `async`, and missing Node
  types used by exceljs/tesseract/register/files; none involve this dialog spec.
- Schema / production / security / accounting / external impact: the five
  Section 18 snapshot columns and `IDX_slim_archive_pending` were added to
  `keepintax-dev`, then 110 rows were backfilled from the transaction cache.
  Production was not accessed. Feezback bank transaction requests now use V2.
  Export recursively redacts secret-shaped keys and authorization strings; no
  support request is sent externally.
- Risks and manual checks: visually verify the dialog against a real admin pull,
  especially large payload scrolling/download, both bank/card URLs containing
  `/tpp/v2/`, and the known Cardcom duplicate group. The existing admin action
  still persists pulled transactions.
- Documentation updated: backend Feezback topic, frontend Feezback dialog topic,
  and this task file.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
