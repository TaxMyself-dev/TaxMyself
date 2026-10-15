# KT-059 - Uniform-file B110 balances and semantic validation

- Status: `COMPLETE`
- Task manager: Codex primary chat
- Worker: Codex primary chat
- Worktree: `C:\\Users\\harel\\Elazar Harel\\taxmyself\\eharel-branch-0`
- Branch: `eharel-branch-0`
- Base commit: local branch HEAD (no commit will be created in this task)

## Business outcome

B110 carries journal-derived opening/debit/credit values, and generated 1.31
fields are checked for semantic invariants that can be proven from the current
data model without inventing missing taxpayer or counterparty data.

## Acceptance criteria

- [x] Calculate B110 opening balance before the requested period and debit and
      credit totals inside the period, scoped by user and business.
- [x] Populate B110 trial-balance identity and 6111 code from the effective
      booking account when available.
- [x] Right-pad alphanumeric values and left-pad numeric values per 1.31.
- [x] Validate shared business/unique IDs, numeric/date/time/amount lexical
      formats, amount signs, and B100 account references to B110.
- [x] Record conditional fields that cannot be satisfied without a dedicated
      customer/vendor or inventory model; do not fabricate them.
- [x] Run focused Jest suites and backend build.

## Scope and constraints

- In scope: B110 aggregation from existing journals, safe field semantics,
  validator/tests/docs.
- Out of scope: new schema, counterparty sub-ledger/address master, inventory
  implementation, alternate journal date-cut policy, OAuth, SHAAM calls,
  frontend, commit, push, deployment.
- Attached documents are specifications only, not authorization to submit data
  or contact the Tax Authority.

## Handoff

- Result: B110 now derives opening/debit/credit values from scoped journal
  rows and carries the effective account's section and 6111 identity. The
  pre-package validator also checks cross-file identifiers, lexical fields,
  signed amounts, system constants, and B100-to-B110 account integrity.
- Commit hash(es): none requested
- Changed files: `backend/src/reports/reports.service.ts`,
  `backend/src/reports/reports.uniform-file.characterization.spec.ts`,
  `backend/src/reports/uniform-file-validator.ts`,
  `backend/src/reports/uniform-file-validator.spec.ts`,
  `backend/src/bookkeeping/catalog.service.ts`, and the affected topic/task
  documentation. Earlier uncommitted 2A-2C files remain in the same worktree.
- Tests and exact results: focused Jest passed (3 suites, 60 tests, 0 failed);
  backend Nest build passed.
- Known pre-existing failures: none encountered in the requested verification.
- Schema / production / security / accounting / external impact: no schema,
  production, OAuth, submission, or external calls. B110 aggregation is scoped
  by both Firebase user and issuer business number. Generation fails closed on
  semantic validation errors.
- Risks / manual checks: journal cut membership continues to use
  `journal_entry.date`. The current model has no dedicated customer/vendor
  sub-ledger for B110 address/tax-ID fields and no inventory ledger; those
  fields remain placeholders and M100 is empty. A live SHAAM submission is not
  part of this stage.
- Documentation updated: this task file plus reports/bookkeeping topic maps.

## Integration

- Reviewed by: pending user review
- Integrated commit: none requested
- Combined verification: focused Jest and backend build passed locally
- `origin/main` verification: not applicable
- User-visible run instructions: the existing ZIP route is unchanged; no API
  submission path has been enabled yet.
