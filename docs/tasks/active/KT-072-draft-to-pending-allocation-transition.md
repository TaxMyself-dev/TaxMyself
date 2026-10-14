# KT-072 — Draft to pending-allocation transition

Status: COMPLETE

## Approval

Elazar reported and approved continuation on the restored-draft allocation
failure on 2026-10-14. No production call, deployment, commit or push is
approved by this task.

## Goal

Allow a restored OAuth draft that holds the next peeked document number to
transition into the official `PENDING_ALLOCATION` document without violating
the unique `(issuerBusinessNumber, docType, docNumber)` constraint.

## Acceptance criteria

- The official number is still reserved under the existing row lock.
- The matching saved draft is removed before the official document insert and
  in the same transaction.
- A later failure rolls back draft removal and counter changes together.
- No document is deleted manually and no official number is skipped.

## Verification

- [x] Focused draft-issuance test
- [x] Focused SHAAM allocation tests (4 suites, 15 tests passed)
- [x] Backend build
- [x] Restored draft `20002` transitioned through the allocation flow without
      the prior duplicate document-number failure

## Constraints

- No production database mutation or SHAAM production call.
- Commit and push approved by Elazar on 2026-10-15; deployment remains a
  separate approval boundary.
