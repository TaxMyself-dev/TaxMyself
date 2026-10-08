# KT055 — Billing release preparation

- Status: PREPARATION_CHECKS_COMPLETE — integration and deployment pending
- Owner: current billing task
- Worktree: billing-debt-recovery/TaxMyself
- Branch: codex/billing-debt-recovery
- Reviewed billing head: 56717057
- Refreshed origin/main: 2f551511
- Authorization: owner requested preparation checks before merging and production delivery.
- Acceptance: review complete billing diff, schema and production configuration,
  focused regression tests and production builds; identify integration blockers.
- Do not change the parallel chat checkout or query/change production.

## Initial findings

- Worktree clean at intake; origin/main has five new commits, billing has 59
  branch-only commits. Fetch succeeded.
- Merge-tree preview (without modifying the branch) found conflicts in
  billing.service.ts, feezback.service.ts, users.service.ts, cumulative
  cutover.sql and my-account.page.ts. Resolve trial activation together with
  STANDARD access guards; retain Feezback mail support and enrollment support;
  remove retired Finsite user fields while preserving server-verified banking
  state. Browser return must not forge hasOpenBanking.
- Both sides append a Section 19 to cutover.sql. Preserve main's Finsite
  retirement and billing DDL, with unambiguous numbering and deployment order.
  No DDL has been run during this preparation.
- Production Angular configuration replaces environment.ts with
  environment.prod.ts, whose API points to the production backend.
- Temporary enrollment bypass is absent from executable code. Card requirement
  is retained; onboarding link creation no longer performs provider discovery.
- Billing registration was verified in dev: PREPARE -> READY, saved card,
  verified hasOpenBanking and trial-end nextBillingDate. This does not constitute
  a production verification or an end-to-end first renewal at trial expiry.

## Verification results

- Backend: `npx jest --runInBand src/billing src/feezback src/guards/subscription.guard.spec.ts`
  passed, 40 suites / 538 tests, exit 0 (667.487 seconds). Failure logs are
  expected mocked recovery/decline scenarios; all selected suites passed.
- Backend: `npm run build` passed, exit 0.
- Frontend: `npm run build -- --configuration production` passed, exit 0.
  Initial bundle 3.14 MB exceeds warning budget; SCSS and CommonJS warnings
  remain. No compilation/build errors.
- Frontend: ChromeHeadless with tsconfig.open-banking.spec.json and explicit
  include arguments matching its specs. First invocation lacked include and
  failed to discover only the allowed specs; corrected invocation passed,
  30 tests / exit 0. Chrome cleanup emitted timeout warnings after success.
- Admin resolution/recovery frontend specs passed separately, 15 tests / exit 0,
  with tsconfig.billing-resolution.spec.json and matching explicit include arguments.
- Initial builds hit sandbox EPERM on dist deletion; reruns with narrowly
  scoped permissions passed. No changes to user servers or production services.
- git diff --check origin/main...HEAD passed.

## Release requirements

All checks listed above concern the billing branch before integration. They do
not authorize treating the unresolved merge preview as a verified release.

- Resolve and review current-main integration, then rerun affected checks on
  the integrated tree before any push.
- Prepare billing DDL application and validation before deploying code that
  queries the new columns/tables. Do not use the full cumulative cutover file
  blindly on an already migrated production database.
- Confirm production REDIRECT, CardCom callbacks/issuer configuration and
  Feezback webhook routing; local env is ignored and not delivered by Git.
- Feezback provider deletion on downgrade/cancellation is still pending the
  provider endpoint and remains an explicitly deferred operational dependency.
