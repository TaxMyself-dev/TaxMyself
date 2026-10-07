# KT053 — Card enrollment before Feezback onboarding

- Status: IMPLEMENTED — local verification; live provider acceptance pending
- Worktree: billing-debt-recovery/TaxMyself
- Branch: codex/billing-debt-recovery
- Base commit: 52403919
- Authorization: Elazar approved implementation; no push.

## Acceptance criteria

- Verify hasOpenBanking from live valid consents and associated sources; empty results never connect and transient errors do not disconnect.
- Only OPEN_BANKING plans may be chosen before consent; show price/date and explicit future-charge agreement.
- Store cards through existing CardCom token-only flow, never charge during trial.
- Incomplete Feezback enrollment never enables automatic billing; verified connection enables the original trial-end billing boundary.
- Recurring charge, retry, idempotency and receipt use canonical billing.
- Cancel future enrollment before trial end; cancellation and plan downgrade provider deletion remain pending Feezback endpoint.
- Owner-only mutations, transaction locks, focused tests and both builds.

## Implementation and verification

Implemented the acceptance criteria above in the billing worktree. CardCom token-only enrollment records owner agreement and a frozen first-period quote. Feezback valid consents plus associated sources independently arm charging; browser return and profile edits cannot forge connection state. Original trial end is preserved. First recurring charge uses canonical obligations, attempts, receipts and retry recovery. Abandoned PREPARE can be withdrawn even after expiry; READY cancellation remains before the boundary. A saved card alone never arms billing.

Both production builds passed. Billing regression passed 30 suites / 449 tests before the final focused additions. Final enrollment suite passed 14 tests; focused backend integration suites passed (orchestration, source verification, Feezback discovery, user state), and canonical renewal recovery passed 15 tests including frozen first charge and replay without a second capture. Scoped frontend tests cover enrollment, cancellation, pricing, recovery and billing state. Angular test discovery must use explicit --include arguments matching tsconfig.open-banking.spec.json; using that config alone discovers unrelated specs and fails compilation. An accidentally broad backend run was interrupted; its unrelated failures were not investigated or declared passing.

Manual acceptance still needed with a trial user: approve an eligible OPEN_BANKING plan, save a test card with no charge, finish Feezback onboarding, verify READY and the original trial boundary; separately abandon enrollment and verify no automatic charge, then withdraw into a non-banking plan. Token-only full-page fallback resumes the same enrollment after backend-confirmed card success. No dev DB, credentials or test-user state changed during implementation.

Missed Feezback webhooks are recovered daily at 02:45 through seven days after trial expiry; beyond that window use provider-confirmed discovery/admin refresh. Remote Feezback deletion on downgrade/cancellation is deferred until its endpoint is supplied. Saved cards remain after withdrawal; purchasing the lower plan remains the ordinary purchase flow. No schema change, merge or push.

No schema, production writes, credentials, provider deletions, live payment calls, or push. Scoped billing_event commands OPEN_BANKING_TRIAL_V1 are mandatory transactional operational state. Existing customers are not retroactively opted into automatic trial billing.
