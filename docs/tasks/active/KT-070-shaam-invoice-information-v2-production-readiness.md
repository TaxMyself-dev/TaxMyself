# KT-070 — SHAAM Invoice Information v2 production readiness

Status: COMPLETE

## Approval

Elazar approved the v2 implementation and `Documents.allocationNum` schema
widening on 2026-10-14, and approved commit and push on 2026-10-15. Production
calls, database mutation and deployment remain separate approval boundaries.

## Goal

Prepare invoice-allocation recovery for the production portal's mandatory
Invoice Information v2 contract before the v1 service closes on 2027-02-01.

## Changes

- Production recovery is fixed to
  `/shaam/production/invoice-information/v2/confirmationNumber`.
- Production and tsandbox v2 send the server-built lookup in lower snake case.
- The downloaded tsandbox contract fixes recovery to
  `/shaam/tsandbox/invoice-information/v2/confirmationNumber`; the legacy v1
  adapter has been removed.
- The sandbox token exchange stays on the previously verified public
  `openapi.taxes.gov.il` gateway. The spec-advertised `t-ita-api` hostname
  failed public DNS resolution during the manual OAuth test.
- Production URLs are validated by exact path and the limited Tax Authority
  hosts appearing in the downloaded portal specifications.
- `Documents.allocationNum` widens from `varchar(26)` to `varchar(50)` without
  rewriting values, matching the v2 `confirmation_number` maximum length.
- Recovered numbers are verified through Invoice Information v2 `details`
  against the complete persisted invoice identity and totals before storage.
- Production details configuration is explicit and fail-closed through
  `SHAAM_INVOICE_DETAILS_URL`.
- A production mismatch blocks storage, finalization and any fallback Approval.
  The tsandbox fixed-fixture mismatch is treated as no recovery only in the
  normal allocation flow, allowing the Approval contract to be exercised;
  manual recovery never persists an unverified fixture number.

## Verification

- [x] Focused SHAAM tests (4 suites, 24 tests passed)
- [x] Backend build
- [x] Apply and verify the widening on `keepintax-dev` only
- [x] Download/verify the tsandbox Invoice Information v2 contract
- [x] Verify tsandbox v2 transport and fixed-fixture behavior on both advertised
      public hosts, including a nonexistent confirmation-number control
- [x] Add fail-closed recovered-allocation identity verification (focused and
      combined SHAAM suites passed; backend build passed)
- [x] Manual v2 tsandbox transport and fixed-fixture characterization
  - 2026-10-14: the normal allocation succeeded for `TAX_INVOICE 20002`
    (`777777715` → `777777723`) and returned
    `20261014205202980287039174`.
  - 2026-10-14: the single approved read-only v2 recovery attempt returned
    HTTP 422 and no confirmation number. Offline review found that the
    temporary verifier serialized the MySQL `DATE` value as a JavaScript date
    string instead of the required `YYYY-MM-DD`; the application service's
    `toApiDate` path does normalize this correctly. No database row was changed.
  - 2026-10-14: after explicit approval, one corrected read-only recovery call
    sent the persisted date as `YYYY-MM-DD` and returned HTTP 200, but returned
    `20261014212153574287055962` instead of the persisted/expected allocation
    number `20261014205202980287039174`. The database remained unchanged and no
    further recovery call was made.
  - 2026-10-14: approved read-only `v2/details` diagnostics showed that both
    allocation numbers resolve to the same unrelated canned invoice (`305`,
    reference `888`, date `2026-08-19`, net `8300.64`, VAT `90`, gross
    `10000.8`). A control lookup using nonexistent confirmation number
    `000000001` returned HTTP 200 and the identical invoice. The behavior was
    identical through both advertised public tsandbox hosts,
    `ita-api.taxes.gov.il` and `openapi.taxes.gov.il`. This demonstrates that
    the tsandbox Invoice Information v2 details endpoint is returning a fixed
    fixture and cannot validate allocation identity or recovery round trips.
    This prevents a semantic recovery round trip in tsandbox; production code
    now compensates by requiring an exact v2 details match before persistence.

## Constraints

- No production SHAAM calls.
- No production database mutation.
- No credentials in source files, logs, screenshots or chat.
- Commit and push approved by Elazar on 2026-10-15.
