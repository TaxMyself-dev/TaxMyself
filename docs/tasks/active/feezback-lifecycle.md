# Feezback lifecycle and admin control

- Status: `IMPLEMENTED` (local feature only; integration pending user approval)
- Worktree: `C:/Users/user/Keepintax/TaxMyself-feezback-lifecycle`
- Branch: `codex/feezback-lifecycle`
- Base commit: `ee9a43ec` (freshly fetched origin/main)

## Acceptance criteria

- Admin Feezback tab lists all users, own entitlement, primary/spouse consent state, independent 0–2 billable identities, last verification, errors and actions.
- Saved-state list never contacts the provider. Incomplete reads remain unknown and preserve last successful evidence.
- Durable reconciliation and disconnect jobs retry failures, recheck entitlement before automatic termination, handle late onboarding and both identities.
- Default observe-only rollout never automatically terminates historical consents.
- Webhooks invalidate/queue provider verification; daily bounded repair catches missed events and entitlement changes.
- Focused backend/frontend tests and package production builds pass; schema and activation documented.

## Constraints

- No accountant permission changes, user deletion, production mutation, main integration or GitHub push.
- Preserve existing changes; dependencies installed independently in this worktree.
- Provider billing is per identity active at month end; spouse is a second identity. Multiple consents per identity count once.

## Verification

Risk tier: backend domain/controller/persistence and frontend component behavior.

- `npm ci --no-audit --no-fund` in backend and frontend: passed independently;
  frontend reports its existing Node 20 engine range while host is Node 24.13.0.
- Backend `npm test -- --runInBand feezback/lifecycle feezback/feezback-sync-reliability.spec.ts feezback/feezback-review-regression.spec.ts feezback/feezback-disconnection.service.spec.ts billing/services/subscription-access.service.spec.ts --silent`:
  8 suites / 125 tests passed, 1 opt-in persistence suite / 2 tests skipped,
  205.414 seconds. This preceded the final lock-order refinement.
- Final affected-backend recheck: `npm test -- --runInBand feezback/lifecycle/feezback-lifecycle.service.spec.ts feezback/feezback-disconnection.service.spec.ts --silent`:
  2 suites / 64 tests passed, 55.981 seconds. Includes the new lock-order guard test;
  unchanged suites above reuse prior evidence, not a claim of a full final-revision rerun.
- `$env:FEEZBACK_LIFECYCLE_DB_TEST='true'; npm test -- --runInBand feezback/lifecycle/feezback-lifecycle.persistence.spec.ts`:
  2 tests passed on keepintax-dev with TEMPORARY table only, 84.185 seconds.
  Earlier sandbox EACCES was an environment failure; scoped elevated rerun passed.
- Backend `npm run build`: passed after the lock-order correction.
- Frontend `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.feezback-lifecycle.spec.json --include=src/app/pages/admin-panel/admin-feezback.component.spec.ts --include=src/app/pages/admin-panel/admin-panel.page.spec.ts`:
  18 tests passed in Chrome Headless 157.0.0.0. Dedicated tsconfig includes Node
  declarations needed by existing admin-page consumers. No criteria were weakened.
- Frontend `npm run build -- --configuration production`: passed. Existing warning
  budgets/CommonJS notices remain; no build error. Initial sandbox-blocked compiler/
  Angular cache writes were rerun with scoped permission and are not baseline code failures.
- No repository-wide suites were run: the focused tests cover changed behavior and
  direct access/disconnection/webhook consumers. No known baseline test failure.
- Visual screenshot attempts through the isolated Karma fixture produced blank
  captures, so they are NOT passing visual evidence. The actual RTL template is
  compiled/rendered in the 18 passing browser tests; manual visual review of the
  integrated application is still required. Temporary preview harness files removed.

## Delivery and operational limits

- New schema is prepared in docs/features/feezback-lifecycle.sql and mirrored in cutover.sql.
  No permanent DDL, production writes, actual provider calls, integration or push performed.
- Feature flags default off. Initial activation must be observation-only; automatic
  historical cleanup requires the separate flag after reviewing the table.
- Deployment must actually run Nest scheduled workers (not an unconfigured scale-to-zero
  service). No cloud resources provisioned. Missing local identities cannot be discovered
  from Feezback's API. Approved READY trials pending billing activation remain unknown
  for review, protecting the first-payment transition from premature disconnection.
- Final subscription check holds the subscription lock through termination, but only
  after acquiring the connection-operation lock; this matches source discovery order.
  Concurrent billing edits can wait for provider I/O.
- backend/.env was copied from main, confirmed ignored, and its feature PORT is 3018.
  Main's unrelated backend/journey-timings.local was preserved.
- Documentation: docs/features/feezback-lifecycle.md, schema/cutover SQL and nearest
  Feezback/admin-panel AGENTS.md files. No shared governance files changed.
