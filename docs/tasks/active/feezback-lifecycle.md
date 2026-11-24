# Feezback lifecycle and admin control

- Status: `INTEGRATED_LOCAL` (manual main verification and push approval pending)
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

## Authorized development setup follow-up (2026-11-23)

- User explicitly requested applying the table to dev and configuring this worktree
  for frontend 4200/backend 3002 without launching servers.
- Applied the prepared CREATE TABLE to verified `keepintax-dev` only. The table was
  absent and is now permanent, with all 13 expected columns, PRIMARY(firebase_id)
  and ix_feezback_lifecycle_due(next_check_at). Verified row count: zero.
- Set ignored `.local-ai-dev/ports.json` to frontendPort=4200/backendPort=3002;
  aligned ignored backend/.env PORT=3002 and generated ignored environment.worktree.ts
  with API URL http://127.0.0.1:3002/. Existing tracked startup scripts consume this config.
- Both startup scripts' `--print-config` modes confirm effective ports/API without
  starting services; Git ignore checks cover all three local configuration files.
- No production changes, server launches, lifecycle flag changes, provider calls,
  main integration or pushes. Earlier schema-not-applied statements describe the
  initial implementation delivery; this explicitly authorized follow-up applies it to dev.
- Schema/local configuration verification only; application suites/builds were not
  repeated because no executable source changed.

## Consent-check diagnosis and local key repair (2026-11-24)

- All 25 saved dev rows reported CONSENT_CHECK_FAILED. A bounded read-only sample
  reproduced failure during JWT signing, before token or consent HTTP requests.
- The copied backend/.env referenced ../global/keys/private.key, but the ignored
  key was absent from the feature worktree. The matching configured key exists
  in the primary checkout. No inline signing key was configured.
- Copied that existing key to the matching missing feature path, without changing
  backend/.env, overwriting a file, or displaying key material. Verified file hashes
  match and git check-ignore confirms global/keys/private.key is excluded.
- Repeated the diagnostic through the actual compiled FeezbackApiService reader
  for primary and spouse identities of one failed sample: both succeeded and
  returned zero consents. An earlier raw GET returned documented USER_NOT_FOUND;
  the application correctly normalizes this to an empty consent list.
- Existing outgoing token/consent requests use the Cloud Run proxy and Feezback,
  not local ngrok. No server was launched/restarted and no consent terminated.
- Observed flags: lifecycle enabled, automatic disconnection disabled. Existing
  stored errors clear on successful queued retries or an admin check request;
  this diagnostic did not write user rows or manually erase errors.
- Verification command: node C:/Users/user/Documents/ChatGPT/Keepintax-Feezback/diagnose-feezback-consent-check.cjs.
  No executable repository source changed, so application suites/builds were reused.

## Admin action feedback and dialog closing (2026-11-24)

- Base revision: bbb918e2. Continued in the existing feature worktree; no main
  integration, push, server startup or provider action is authorized/performed.
- Fixed the missing immediate feedback: sending labels/spinners, per-user queued
  progress and a fixed accessible status notice remain visible while scrolling.
  Saved-state polling reports provider completion/failure separately from queue
  acceptance. Duplicate queued submissions are disabled. An older in-flight GET
  cannot incorrectly complete newer work; background refresh preserves pagination.
- Fixed X in both consent details and disconnect confirmation by handling PrimeNG
  visibleChange. Installed PrimeNG emits false from close(); onHide occurs only
  after visibility has already been changed, so the former binding never closed it.
- Risk tier: component behavior. Added real DOM X-click/reopen tests, sending/queued/
  completion and failure tests, duplicate prevention and concurrent table-load coverage.
- Focused command: npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.feezback-lifecycle.spec.json --include=src/app/pages/admin-panel/admin-feezback.component.spec.ts
  Final result: 14/14 passed in Chrome Headless 157.0.0.0, including explicit
  provider-proof requirements before displaying successful disconnection. An initial 12/13 run exposed a
  stale test DOM reference after ngFor rebuilt a row; inspected the failure and
  re-queried the actual queued button without weakening the assertion, then reran.
- Required production build: npm run build -- --configuration production
  Result: passed on the final UI source, exit 0. Existing stylesheet/initial-bundle
  warning budgets and CommonJS warnings remain; no new build failure. This final
  checkpoint follows the provider-proof feedback guard; the earlier passing build
  is not presented as final-revision evidence.
- git diff --cached --check passed; both local Markdown links resolve. No secrets,
  ignored environment/key files, generated output or diagnostic logs are staged.
- Backend suites and external/DB checks were not repeated: no backend/API/schema/
  accounting/auth changes. Documentation updated in feature guide and admin topic.

## Simplified connection comparison (2026-11-24)

- Base: 22581a2f, same existing feature branch/worktree. User requested a simple
  comparison of provider permissions vs saved local connection with a short cause,
  explicitly distinguishing synthetic demo data from genuine provider consents.
- Main table reduced to user, provider permissions, saved local connection and one
  explanation plus actions. Removed duplicate missing-subscription messages, raw
  identifiers, repeated dates, separate identity columns and billing-unit clutter
  from the main table. Advanced information stays behind Details, initially collapsed.
- Review count/filter now reflects real verification problems, actual discrepancies
  and provider permissions requiring entitlement review. A missing subscription
  with no provider/local connection is not a problem. Expected local demo data with
  zero provider consents is explained without a warning. Real consents on demos
  remain visible and actionable. Stale/failed/unknown data never becomes 'no'.
- Added a batched read of local link provenance and display-only localDataIsDemo.
  Registered demo profiles and paired, unverified legacy document-lab fixture IDs
  are recognized without guessing from an arbitrary name/email. This does not change
  synthetic capability, external reads, billing/cost, authorization, automatic jobs
  or disconnection policy. No new schema, user-data modification or provider action.
- Backend: npm test -- --runInBand feezback/lifecycle/feezback-local-data.spec.ts feezback/lifecycle/feezback-lifecycle.service.spec.ts --silent
  Passed: 2 suites / 16 tests, 50.563 seconds.
- Frontend: npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.feezback-lifecycle.spec.json --include=src/app/pages/admin-panel/admin-feezback.component.spec.ts
  Passed: 20 tests in Chrome Headless 157.0.0.0, including existing action/X tests
  and new demo/missing-subscription/discrepancy/table-layout cases. The unknown-state
  fixture now consistently sets both identity counts unknown, not just the total.
- Required builds passed on the final source, exit 0: backend `npm run build` and
  frontend `npm run build -- --configuration production` (hash 53985b525533a277,
  50.504 seconds). Existing warning-only bundle/style/CommonJS notices remain.
- No broad-suite repetition: focused domain/listing/browser checks cover changed
  behavior. Main integration, push and starting application servers remain unauthorized.

## Local main integration (2026-11-24)

- Explicit user approval: integrate into local main. No GitHub push approval.
- Main before integration: 15d8ce5f5f641eb0aab43fe9f7d51d87abb05a45.
  Feature before integration: 12ea4f59d27a2dd47aaa68278330442e0046e546.
  Tested merge candidate and fast-forward main: 4e35dce10f6e246ba6a40047c0144a27df1eae94.
- Merged current main into feature first. Resolved four conflicts in cutover.sql,
  admin-panel/AGENTS.md, admin-panel.page.ts and admin-panel.page.spec.ts.
  Preserved current main AI navigation, both additive schema/documentation sections,
  current admin tests and the new Feezback tab. No schema SQL was executed.
- Backend `npm ci --no-audit --no-fund` and `npm run build`: exit 0.
- Frontend `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.feezback-lifecycle.spec.json --include=src/app/pages/admin-panel/admin-feezback.component.spec.ts --include=src/app/pages/admin-panel/admin-panel.page.spec.ts`: 24 passed.
- Frontend production build with NG_BUILD_MAX_WORKERS=1:
  `npm run build -- --configuration production`: exit 0, hash 654ba673502deb12.
  Existing bundle/style/CommonJS warnings remain.
- Backend `npm test -- --config=C:/Users/user/Documents/ChatGPT/Keepintax-Feezback/feezback-integration-jest.cjs feezback/lifecycle feezback/feezback-sync-reliability.spec.ts feezback/feezback-review-regression.spec.ts feezback/feezback-disconnection.service.spec.ts billing/services/subscription-access.service.spec.ts billing/services/ai-module-access.spec.ts --silent`:
  10 suites passed, 1 skipped; 133 tests passed, 2 skipped (opt-in MySQL temporary
  persistence tests, previously verified). External config retains package Jest
  settings with one worker and workerIdleMemoryLimit=768MB.
- Initial concurrent frontend build and in-band backend selection terminated without
  a compiler/assertion failure or complete test summary under memory pressure.
  They are not counted as passing runs. Serial build and bounded worker run above
  completed with unchanged criteria. Exact tested candidate was fast-forwarded;
  subsequent documentation-only changes do not require repeating these checks.
- Main local environment preserved: frontend 4200, backend 3000. Lifecycle flags
  remain unset/off; no scans, automatic disconnections or application servers started.
  No provider mutations, production changes or remote pushes were performed.
- Private backup verified with SHA-256 for 22 local files (205025 bytes):
  C:/Users/user/.codex/worktree-backups/TaxMyself-feezback-lifecycle-20261124T144857Z.
  Worktree logical file size before removal: 4937203137 bytes (regenerable caches
  excluded from backup). Branch and commits retained. Main manual testing and
  explicit push approval are still pending.
- Cleanup completed: verified no development listeners on 4202/3002 and no matching
  node/Chrome/editor process requiring the feature. git worktree remove without
  force succeeded; exact feature path is absent. Approximately 4.60 GiB of logical
  worktree files removed (physical free-space change not measured).
