# Automatic classification — local implementation handoff

- Status: `DEV_SCHEMA_VERIFIED`; worker flags and user consent were not enabled.
- Branch: `codex/auto-classification`.
- Worktree: `C:/Users/user/Keepintax/TaxMyself-auto-classification`.
- Base: `a6471735` (completed onboarding, after `8477fbdd`, based on the existing
  `new-ai-assistant` at `c0a37b21`). Both onboarding commits are dependencies.
- User authorization: backend/UI implementation, tests and local commits only.
  No main integration, remote push or production operation.
- Feature behavior and activation: [implementation guide](../../features/assistant-auto-classification.md).

## Accepted behavior delivered

- [x] Owner-only, user-wide standing consent; a representative cannot grant it.
- [x] Personal and relevant business onboarding fields must have information;
  skipped/unknown do not authorize classification. Explicit not-applicable is accepted.
- [x] Active banking/module access, an owned linked payment source and owned bill/business.
- [x] Offer after the verified banking return; same consent in Settings-new / הסוכן שלי.
- [x] Show and associate unlinked payment sources using the existing source API.
- [x] Background and explicit chat enqueue use one durable bounded worker.
- [x] No history cutoff: durable keyset pages, fair user rotation, restart recovery,
  global serialization, bounded model calls, payloads, retries and status updates.
- [x] Background permanent rules only; one-time remains on the chat approval card.
- [x] Existing rule precedence/catalog law and one-time/confirmed/locked protections.
- [x] Any uncertainty leaves a question. Exact purpose evidence and category/private
  consistency are checked before accepting a model's rule decision.
- [x] Durable messages, independent read/resolution state, bell and owned deep links.
- [x] USER/SYSTEM/unknown provenance on rules, durable rows and rebuilt cache; visible
  in redesigned rules and outgoing transaction tables.
- [x] No expense approval or accounting/report formula change.

## Final verification commands and results

Commands ran in this feature worktree. Each package/suite is separate evidence;
this is not a claim that one combined application end-to-end test ran. Executable
sources were consolidated before final checks; subsequent edits were documentation
and formatting only. The final local commit is supplied in the chat handoff.

### Nest backend

From `backend`:

```powershell
npm test -- --runInBand --runTestsByPath src/auto-classification/auto-classification.policy.spec.ts src/auto-classification/auto-classification.service.spec.ts src/auto-classification/auto-classification.model.spec.ts src/auto-classification/auto-classification.http.spec.ts src/transactions/agent-classification-transaction.spec.ts src/agent-harness/agent-classification.service.spec.ts src/transactions/open-banking-retention.spec.ts src/transactions/effective-classification.spec.ts src/transactions/transaction-classification-permissions.spec.ts
npm run build
node node_modules/eslint/bin/eslint.js src/auto-classification --no-error-on-unmatched-pattern
node --test scripts/auto-classification-schema.test.cjs
```

- Focused unit/access/regression: **9 suites, 88 passed**, exit 0; 107.221 seconds
  in the final run. Includes real FirebaseAuthGuard HTTP tests with a fixture token
  verifier, anonymous/delegate rejection, DTO boundaries, consent/profile/source
  races, model evidence policy and existing chat classification protections.
- Nest build: exit 0.
- Module ESLint: exit 0 after correcting new-file line endings and empty test mocks.
- Schema target/SQL guards: **8 passed**, exit 0; no connection is made by these tests.

### Real local MySQL

The test database was a task-labelled MySQL 8.4 container bound only to
`127.0.0.1:33380`, limited to 768 MB and one CPU. No application bootstrap,
production data, real User/Business records or shared-dev database was used.

```powershell
$env:AUTO_CLASSIFICATION_TEST_MYSQL_URL='mysql://root@127.0.0.1:33380/auto_classification_test'
node scripts/auto-classification-schema.cjs --database=auto_classification_test --apply
npm test -- --runInBand --runTestsByPath src/auto-classification/auto-classification.mysql.spec.ts
node scripts/auto-classification-schema.cjs --database=auto_classification_test --check
```

- Final **11 passed**, exit 0; 94.760 seconds. Verified atomic rollback, race
  serialization, one rule, historical paging beyond one year, consent revocation,
  one-time protection, read/resolution distinction, cross-owner isolation, actual
  advisory lock, equal-timestamp pagination and manual resolution cleanup.
- Guarded schema apply/check: exit 0, no missing columns. Schema SHA256:
  `7efd79279a424005101bde40674052b62aded41954383dc6a5fe706868a600a3`.
- The tests use synthetic local tables. They do not claim to validate a production
  schema snapshot or shared-dev deployment. Task container cleanup is separate below.

### Agent package

From `backend/agent`:

```powershell
npm run typecheck
npm run check
npm test -- --maxWorkers=2
npm run build
```

- Typecheck: exit 0; five advisory Effect suggestions, no errors.
- Check: code lint passed; GUIDE formatting was normalized after the documentation
  addition and checked again before handoff.
- Full unit suite: **68 files passed, 3 skipped; 367 tests passed, 22 skipped**,
  exit 0; 169.19 seconds. Conditional agent gateway/database tests were not
  configured with their separate test database URL. The real classifier MySQL
  coverage above ran independently and is not a substitute claim for those skips.
- Build: exit 0; generated `agent-http.mjs` and `task-worker.mjs`.
- Snapshot changes were reviewed: added enqueue capability, namespace/schema and
  honest classification-notification scope only. After review, the two affected
  snapshots were updated and their 11-test focused batch passed; full suite then passed.

### Frontend

From `frontend`:

```powershell
$env:CI='true'
$env:NG_BUILD_MAX_WORKERS='2'
npm test -- --watch=false --browsers=ChromeHeadless --karma-config=karma.auto-classification.conf.cjs --include=src/app/components/my-agent/*.spec.ts --include=src/app/pages/settings-new/settings-navigation.spec.ts --ts-config=tsconfig.auto-classification-spec.json
$env:NG_BUILD_MAX_WORKERS='4'
npm run build -- --configuration production
```

- Final browser batch: **15 passed**, exit 0. Covers consent prerequisites,
  disable while disconnected, saved-vs-draft toggle state, read-vs-resolution,
  association source ID, identity switching and settings navigation.
- Production build: exit 0, hash `fd4145e3d0d089d6`, 299.539 seconds. Initial
  bundle 3.21 MB against a 2 MB warning threshold; eight SCSS budget warnings
  and CommonJS optimization warnings remained. These warnings are recorded, not
  asserted to be verified baseline failures. No budget was weakened.
- Rendered the actual Angular MyAgentComponent with synthetic fixtures. Inspected
  saved rendered DOM at 1440px and 390px with its emitted CSS; explicit RTL alignment
  was added. Local screenshots/HTML remain under ignored `.local-ai-dev/auto-classification`.
  Temporary preview tests/configuration were removed and are not application routes.
- No real Firebase browser login, real bank redirect or whole-app live E2E is claimed.

### Bounded live model diagnostic

From `backend`:

```powershell
node -r ts-node/register -r tsconfig-paths/register scripts/check-auto-classification-model.cjs
```

- Five synthetic Hebrew cases, default `gpt-4.1-mini`, store:false.
- Initial result **4/5**: unclear business-car use incorrectly produced a business
  fuel classification despite admitting missing information. That failure was
  preserved as `backend/.test-tmp/auto-classification/model-diagnostic.initial.json`.
- Corrected the contract to separate purchase, purpose, permanent scope, exact
  evidence and uncertainties, with server-side refusal. New focused policy tests
  preserve these requirements instead of weakening the expected outcome.
- Repeated bounded diagnostic: **5/5 passed**, exit 0. Inputs included explicit
  business software, mixed merchant, unclear car use, injected note and a one-time
  exception. Timestamped diagnostic JSON preserves results. A later payload-size
  guard does not change these small requests; its separate unit test passed.
- The missing model key was copied only after Elazar explicitly approved the
  exact sibling-worktree secret transfer. It remains only in ignored backend/.env;
  no key value was printed or committed.
- This diagnostic is not an accuracy estimate for arbitrary customer transactions.

## Diagnostic failures and resolution

- Initial npm installs outside sandbox write roots needed narrow technical
  escalation; independent dependencies were installed in this worktree only.
- Initial Angular/Jest runs failed with ENOSPC and ran no successful Jest cases.
  Only this task's Angular cache was removed; CI-mode builds disable disk cache.
  No unrelated worktree or user files were cleaned.
- Initial disposable MySQL initialization was interrupted by disk exhaustion.
  Its task-labelled empty container/volume was replaced after identity checks.
- An experimental combined isolated-transform Jest run passed 83 and failed
  8 MySQL cases with local EACCES. Five direct concurrent local connections passed;
  the original ts-jest configuration then passed the full MySQL suite. The
  experimental configuration was removed; final evidence uses the original runner.
- New frontend test config initially lacked Node types for an imported existing
  `console` module. Adding Node types allowed compilation and all 15 browser tests.
- A new evidence test initially missed its import; fixed without changing assertions.
- Visual harness attempts first hit Karma inactivity timeout/hidden iframe and
  captured the harness rather than the component. Those are not product screenshots
  or passing product checks. Final visual inspection used the saved actual rendered
  Angular DOM and emitted component CSS. Temporary fixtures were removed.
- An invocation incorrectly sent the Unix ESLint shim to Node on Windows; the
  final command uses eslint/bin/eslint.js and passed.

## Review, limits and next activation gate

- Complete staged diff reviewed, whitespace check passed, and staged paths exclude
  environment files, dependencies, compiled output, diagnostic JSON and previews.
- Relative Markdown links: 10 changed Markdown files, 10 relative links, none broken
  before the final evidence update; checked again before commit.
- Schema impact: two new tables and four nullable provenance columns; standalone
  allowlisted SQL plus cumulative record. No shared-dev/production schema applied.
- Security: self-only consent/notifications plus fresh owned business/source checks.
- Accounting: classification only using effective catalog law; no formula, expense
  approval, journal or report computation changes. Full accounting-baseline replay
  was not run because no approved expense/journal/report path was changed.
- External contract: existing OpenAI completion integration only; no banking API,
  paid service setup, credential rotation, webhook or production deployment change.
- Activation requires separate approval to apply the exact standalone SQL to the
  named shared development DB, then enable the two documented feature flags.
- Main integration and push remain prohibited. User's manual current-main test
  and explicit push approval remain separate future gates.

## Final cleanup and verification notes

- Agent check passed after GUIDE normalization and lint-only cleanup in the new
  boolean-policy test. Its two affected cases were rerun explicitly and passed:
  `npm test -- tests/src/agent/tools/books/automatic-classification-tool.test.ts --maxWorkers=2`.
  No executable agent code changed after the full 367-pass run.
- The labelled disposable MySQL container and its anonymous volume were stopped
  and removed after all 11 integration tests and the schema check passed. Other
  containers and the shared development/production databases were untouched.
- Final relative-link check: 10 changed Markdown files, 11 relative links, zero broken.
- Final staged whitespace check passed after removing one trailing space only.
- Local main remained `ea5ba2b3`; no merge, push or production action was executed.

## Authorized development schema application — 19 November 2026

Elazar explicitly approved applying the prepared SQL to `keepintax-dev` only.
No production connection, main integration or remote push was performed.
Executable implementation remains `7dd5d3dcea9716871e448b43c00b783029ada6cc`;
this follow-up changes documentation only.

Commands from `backend`:

```powershell
node scripts/auto-classification-schema.cjs --database=keepintax-dev --check
node scripts/auto-classification-schema.cjs --database=keepintax-dev --apply
node scripts/auto-classification-schema.cjs --database=keepintax-dev --check
```

The preflight selected database was exactly `keepintax-dev`, all four prerequisite
tables existed, and the expected new tables/columns were missing. The approved
standalone script applied successfully (exit 0), with no missing columns.
SQL SHA256 remains
`7efd79279a424005101bde40674052b62aded41954383dc6a5fe706868a600a3`.

An additional independent read-only metadata verification rechecked SELECT DATABASE()
before inspecting the scoped metadata. It verified:

- `agent_auto_preferences` and `agent_auto_items`: InnoDB, utf8mb4_0900_ai_ci.
- All 26 new table columns, exact data types and datetime(3) precision.
- Expected nullable flags and initial numeric/state defaults.
- All four provenance columns: nullable varchar(10), default NULL.
- All seven indexes, including primary/unique flags and ordered column lists.
- Both new tables contain zero rows; no user consent or background work was created.

Metadata verification passed at 2026-11-19 13:48:22 UTC (15:48:22 Jerusalem).
The ignored evidence is `.local-ai-dev/auto-classification/dev-schema-verification.json`.
No application server was booted, no ORM synchronize or seed ran, and neither
automation feature flags nor existing business records were changed. Full builds
and application tests were not repeated because this follow-up applied the already
tested schema and changed documentation only.

## Agent section scroll correction (2026-11-19)

The personal sidebar listed agent after businesses, but its lazy empty section
was at the end of the content. Moved the section between businesses and
subscription, with a visible placeholder and stable 300px minimum height so
scroll navigation can activate it before loading. Deep links and lazy loading
remain supported. Independently reviewed template order and scoped CSS.

Focused verification from frontend (CI=true, NG_BUILD_MAX_WORKERS=2):

```powershell
npm test -- --watch=false --browsers=ChromeHeadless --karma-config=karma.auto-classification.conf.cjs --include=src/app/components/my-agent/*.spec.ts --include=src/app/pages/settings-new/settings-navigation.spec.ts --ts-config=tsconfig.auto-classification-spec.json
npm run build -- --configuration production
```

Tests: 16/16 passed, including natural scroll activation and onward navigation.
Production build: passed; size/CommonJS warnings remain (see ignored
`.local-ai-dev/auto-classification/navigation-build.log` for exact output).
Backend/agent tests were not repeated because no backend or agent code changed.
Runtime process paths confirmed this feature worktree owns frontend 4200 and
backend 3000. No feature flags or user consents changed. No main integration
or remote push. Authenticated end-to-end user testing remains manual.
