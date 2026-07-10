# Intentional baseline diffs registry (D15)

The Phase 0.5 baseline report fixtures (`docs/redesign/baseline-reports/`)
are the golden files Phases 1–4 must reproduce exactly. This document is
the one controlled exception: every deliberate, approved data correction
that will change a report total, with its accounting rationale, affected
business, and expected numeric delta. The Phase 1.7/3.6/4.6 comparison
script must show ZERO diffs outside this registry — any unexplained diff
is a blocker, not a footnote (plan execution rule 4).

---

## Correction #1 — Bituach Leumi advances remapped off the P&L

**Business:** 204245724 (אוריה הראל אדריכלות)

**Affected journal entries:** ids 10000145, 10000158, 10000167, 10000173,
10000186, 10000203 — all six `journal_line` rows currently posted to
account `5000` (הוצאות בלתי מזוהות), description `EXPENSE # - ביטוח לאומי
ספק הוק`.

**Current (pre-migration) figures**, verified 2026-07-10 directly against
`keepintax_prodcopy` and cross-checked against
`docs/redesign/baseline-reports/204245724.json`:

| | value |
|---|---|
| Gross debit total | ₪22,645.00 |
| `amountForTax` total (what P&L actually sums) | ₪11,775.40 |
| Aggregate P&L "הוצאות בלתי מזוהות" category (2026-01-01..2026-05-20) | ₪11,775.40 |

**Rationale:** per D14 decision 3, מקדמות ביטוח לאומי (National Insurance
advances) are a business payment, not a P&L expense — they get remapped in
Phase 1 to a technical/balance account in the 90000 range (visible in
ledger and cash flow, excluded from P&L sections), same treatment as the
other technical payments in that decision (מקדמות מס הכנסה, גביית מע"מ).

**Expected delta:**
- P&L: business 204245724's "הוצאות בלתי מזוהות" expense category drops by
  exactly **₪11,775.40** (from whatever pre-migration total it shows in
  the period/aggregate containing these six entries); `netProfitBeforeTax`
  rises by the same amount.
- VAT report: **no change** — none of these six lines touch account 2410
  (input VAT), so `vatRefundOnExpenses`/`vatRefundOnAssets`/`vatPayment`
  are unaffected.
- Ledger: the six lines move from account `5000` to the new 90000-range
  Bituach Leumi technical account — account `5000`'s ledger balance for
  this business drops by ₪22,645.00 (gross), the new technical account's
  balance rises by the same.

**Status:** approved by Elazar 2026-07-10, correcting an earlier
"~₪29,645" placeholder in D15 that didn't match the underlying data (see
`docs/redesign/production-baseline.md` "Open items" §1 for how the
discrepancy was found).

**Superseded note (history):** the master plan's D15 originally quoted
"~₪29,645 total" for these six entries. That figure did not match either
the gross debit (₪22,645.00) or the `amountForTax` sum (₪11,775.40) when
independently verified against the dump — corrected here and in the master
plan itself.
