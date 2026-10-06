# KT-044 — Owner-authorized dev debt fixture

- Status: COMPLETE
- Date: 2026-10-06 (Asia/Jerusalem)
- Branch: codex/billing-debt-recovery
- Authorization: Elazar identified his own dev user and explicitly approved
  creating test debt and setting the subscription dates needed to test recovery.
- Target: keepintax-dev only; subscription 7, plan 5, obligation 1.

## Fixture

Locked the specified subscription and refused mismatched identity, plan,
status/access mode or any pre-existing debt. Created one OPEN recurring
obligation and updated subscription dates in the same real TypeORM transaction.
No existing debt was overwritten, no other account was changed.

- Test service period: 2026-10-06 through 2026-11-06 (end exclusive).
- Current assigned plan: 5, exempt-business base price 49.00 ILS.
- Existing discount: none. VAT: 8.82 ILS; total: 57.82 ILS.
- Obligation key: subscription:7:period:2026-10-06.
- Active/satisfied attempt pointers: null; version: 0.
- Subscription stays PAST_DUE/STANDARD, with anchor day 6, renewalAttempts 3.
- Prior-period dates set to September 6–October 6, nextBillingDate October 6,
  using Jerusalem boundaries. Grace/cancellation/end dates remain null.
- These are expressly approved test dates/prices, not recovered historical
  evidence or an automatic historical backfill.

## Verification

- Temporary script syntax check passed.
- Real TypeORM connection used synchronize=false/migrationsRun=false and only
  billing entity metadata; Nest, boot seeds and scheduled jobs were not started.
- Seed transaction passed, exit 0.
- Real BillingDebtService.preview executed against that datasource afterwards:
  one period, total 5782 agorot, currency ILS, valid recoveryQuote. It opened
  no additional debt during verification.
- No CardCom call, attempt, payment, card update or invoice was created.
- Temporary machine-specific script was removed; no credential files added.
- Real hosted payment remains for the user's manual test. This fixture has one
  period; successful payment alone does not verify a multi-period invoice.
