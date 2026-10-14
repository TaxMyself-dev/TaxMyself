# KT-069 — Persisted SHAAM invoice-allocation flow

Status: COMPLETE

## Goal

Request and recover an Israel Tax Authority allocation number only for a
persisted, immutable `PENDING_ALLOCATION` invoice with its final document
number, then save the returned allocation number before PDF/journal
finalization.

## Required flow

1. Persist the invoice, lines and final document number as
   `PENDING_ALLOCATION`.
2. Build the SHAAM payload on the backend from that stored record.
3. Attempt official recovery for that exact persisted reference before any new
   Approval request.
4. Use a stable `INVOICE_ID` derived from the persisted invoice identity when
   a new Approval is actually required.
5. Save a successful allocation number on the invoice before finalization.
6. Finalize the existing invoice into PDF/journal/status without allocating a
   second document number.
7. Provide recovery through the official
   `Invoice-Information/confirmationNumber` endpoint for an interrupted or
   ambiguous request.

## Acceptance criteria

- The browser cannot choose invoice amounts, dates, VAT numbers or
  `INVOICE_ID` for the SHAAM request.
- A SHAAM request cannot run for an unsaved draft.
- Retrying finalization for a document that already has an allocation number
  never sends another approval request.
- A lost/timeout response leaves a visible pending document and can be
  recovered without submitting a duplicate approval request.
- The successful user path is one action after confirmation: reserve the final
  document number, request allocation, persist it, generate PDFs and post the
  existing journal entry flow.
- No database schema change is required.

## Verification

- [x] Focused backend unit tests (recovery/allocation suites 5/5 after wire-format fix)
- [x] Nest backend build
- [x] Angular production build (existing budget/CommonJS warnings only)
- [x] Recovery request serializes the exact case-sensitive official field names
- [x] Manual tsandbox flow with the allocation demo profile
- [x] Manual interrupted-response recovery test

## Constraints

- No production SHAAM calls.
- Commit and push approved by Elazar on 2026-10-15; deployment remains a
  separate owner-approved action.
- Preserve the existing journal-entry and PDF generation behavior.

## Production follow-up

- Production Invoice Information v2 readiness, including the approved widening
  of `Documents.allocationNum` to `varchar(50)`, is tracked separately in
  KT-070. KT-069's persisted/recovery flow was verified successfully in the
  current tsandbox contract.
