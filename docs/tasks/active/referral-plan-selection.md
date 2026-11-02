# Referral plan selection

- Status: COMPLETE_LOCAL
- Branch: fix/referral-plan-selection
- Worktree: C:\Users\user\Keepintax\TaxMyself (primary folder; explicitly requested by owner, without another worktree)
- Local base commit: ee10b7b1c38c2a087c8233c7f6d82ff8b6dbf780
- Source: owner-supplied cloud patch 00339e9e215511448ebe58d5cd54826af3a76cb2, followed by the owner's explicit instruction to remove automatic referral upgrades.

## Acceptance criteria

- Referral owners see all active private referral plans, regardless of bank connection. Public owners see active public plans. Unrelated private plans remain isolated.
- Selected plans are preserved through checkout; public/referral paid changes share BillingPlanChangeService preview, confirmed quote, canonical prorated upgrade payment, and downgrade scheduling at the next renewal.
- Feezback source discovery never chooses or upgrades a subscription plan.
- The unused legacy direct referral-upgrade endpoint and its plan-swap helpers are removed so they cannot bypass ordinary paid changes.
- Existing owner authorization, debt recovery and explicitly approved trial enrollment rules are preserved.

## Implementation and review

- Catalog eligibility is shared by plan listing, checkout, paid preview and trial banking enrollment.
- An inactive assigned plan continues to identify its private catalog.
- Removed automatic referral upgrade from Feezback refresh and removed POST billing/upgrade-to-open-banking (no frontend callers found).
- The public/referral plan-change suite runs identical proration, zero-charge, downgrade-boundary, pending-payment and authorization checks for both catalogs.
- Added checkout-routing coverage for both catalogs and repeated verified-discovery regression coverage.
- Updated backend billing, Feezback and frontend billing topic documentation.
- No schema, production data, accounting formulas, credentials or external provider contracts changed. The removed route is an internal application endpoint.

## Local verification

- Nest build passed (exit 0).
- Angular plans-page browser tests: 7 passed (exit 0). The first sandbox run compiled but could not launch Chrome; the permitted local rerun passed.
- Angular production build passed (exit 0), with bundle/style budget and CommonJS warnings.
- Focused backend regression run: 9 suites, 258 tests passed (exit 0), covering billing.service, billing-plan-change, open-banking-enrollment, billing-attempt-orchestration, billing-hosted-completion, billing.controller, Feezback connection-state, reconnect and spouse. Command: npm test -- --runInBand --cacheDirectory ./node_modules/.cache/jest-referral-plan-selection --runTestsByPath followed by those nine spec paths under src/. The default temporary Jest cache failed with EPERM before executing tests; the task-local replacement cache was removed after execution.
- git diff --check passed.
- Tests use local mocks; no live provider, payment or database access, application startup, push, deployment or main integration performed.
- Unrelated pre-existing app-mapping/ is untouched.

## Manual verification

- In local UI, verify public/referral owners see only their own catalog and can choose upgrade/downgrade through the same confirmation screen.
- Refresh a connected referral-basic user's sources and confirm the selected plan is retained.
- Check renewal-boundary downgrade and bank-module entitlement with normal application data before any remote delivery. Provider consent termination on downgrade remains the existing separate explicit-disconnection behavior.
