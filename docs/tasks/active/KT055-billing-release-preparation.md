# KT055 — Billing release preparation

- Status: INTEGRATION_VERIFIED — conflicts resolved; local merge ready
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

Checks above concern the billing branch before integration. The owner subsequently
authorized conflict resolution. Main 2f551511 is now integrated locally.
Both constructors are retained, banking state is server-verified,
Finsite initialization removed and trial activation combines with STANDARD guards.
Cutover sections now use 19 for Finsite, 20 for billing and 21 for link membership.
No production SQL, push or deployment has been performed.

- Integrated backend build and production frontend build passed. Backend selected
  regression run: 40 suites / 542 tests passed; one UsersService smoke test failed
  because its fixture provides no SharedService. Reproduced the identical failure
  with origin/main's service and test copied to temporary files in the billing
  worktree, using integrated dependencies; removed those files afterwards.
  This is a baseline test-fixture limitation, not a passing overall test run.
- Users banking-state protection test passed separately; main's admin endpoint
  security and provider transaction deduplication tests passed (4 tests).
- Integrated frontend banking/billing checks passed (30 tests); admin resolution
  checks passed separately (15 tests, overlapping recovery coverage).
- Main's frontend identity-session isolation and admin route guard checks passed
  separately (8 tests).
- Compared resolved cutover statements to original billing SQL plus main's
  retirement SQL after stripping comments: statements are identical. Only
  section ordering/numbering changed. No SQL execution occurred.
- Prepare billing DDL application and validation before deploying code that
  queries the new columns/tables. Do not use the full cumulative cutover file
  blindly on an already migrated production database.
- Confirm production REDIRECT, CardCom callbacks/issuer configuration and
  Feezback webhook routing; local env is ignored and not delivered by Git.
- Feezback provider deletion on downgrade/cancellation is still pending the
  provider endpoint and remains an explicitly deferred operational dependency.
