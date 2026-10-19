# KT-075 - Allocation number display

- Status: `PUSHED`
- Task manager: Codex
- Worker: Codex
- Worktree: primary checkout
- Branch: `main`
- Base commit: `c712ed19`

## Business outcome

Issued PDFs display only the nine rightmost characters of the SHAAM allocation
number, while the complete upstream value remains stored on the document.

## Acceptance criteria

- [x] Preserve the complete SHAAM `confirmation_number` in `Documents.allocationNum`.
- [x] Display only the nine rightmost characters under `מספר הקצאה` in generated PDFs.
- [x] Preserve leading zeroes in the displayed nine-character value.
- [x] Run the focused PDF routing test, SHAAM persistence test and Nest
  production build.

## Scope and constraints

- In scope: issued-document PDF presentation, focused regression coverage and
  documents topic documentation.
- Out of scope: SHAAM request/response handling, allocation persistence,
  database schema, numbering, journal entries, frontend and production deployment.
- Schema / production / security / accounting / external-contract impact: none.
  This is a presentation-only correction.

## Handoff

- Result: complete; PDFs render the rightmost nine characters and persistence
  remains unchanged.
- Changed files: document PDF model preparation, focused routing test, documents
  topic documentation and this task record.
- Verification: PDF routing Jest suite 24/24; SHAAM document-allocation Jest
  suite 9/9; Nest production build passed; `git diff --check` passed.
- Schema / production / security / accounting / external-contract impact: none.
- Production deployment: not performed.

## Integration

- Reviewed by: Codex
- Integrated commit: this task commit on `main`.
- `origin/main` verification: push pending at the time this record was staged.
