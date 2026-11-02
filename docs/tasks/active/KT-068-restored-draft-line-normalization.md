# KT-068 — Normalize restored draft lines before document creation

Status: COMPLETE

## Goal

Allow a database-restored document draft to pass create-document validation
after a successful SHAAM allocation request, without requiring another
allocation request.

## Root cause

MySQL `DECIMAL` fields are returned as strings. The frontend draft restore also
carried numeric VAT enum values and string unit-of-measure values. The line DTO
expected a conflicting mixture of types, while the restored gross-line value
was produced by string concatenation (`6000.001080.00`).

## Changes

- Normalize optional line amounts to numbers before validation.
- Convert numeric VAT enum values to the names already handled by the document
  service.
- Validate `unitType` against `UnitOfMeasure` rather than as a number.
- Rebuild a malformed derived gross-line amount from net plus VAT.
- Add a focused regression test matching the SHAAM demo draft payload.
- Normalize restored draft lines in the frontend before rendering or reuse.
- Persist a successful/existing allocation number to the draft before final
  issuance, and offer an explicit path to enter an already-issued number.

## Verification

- [x] Focused DTO test
- [x] Nest backend build
- [x] End-to-end restored-draft issuance reached allocation for document
      `20002`; the focused DTO and draft-issuance regressions cover the
      normalized persisted payload

## Constraints

- Do not refresh the current browser page before the manual retry.
- Commit and push approved by Elazar on 2026-10-15; deployment remains a
  separate approval boundary.
