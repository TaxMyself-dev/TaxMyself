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

## Reuse account-association drawer (2026-11-19)

Replaced the agent's inline bill selector with the shared black application
button. It opens the same AccountAssociationDialogComponent as transactions.
The existing AddBillComponent creates a missing account, refreshes the scoped
account list and returns to the original association drawer; cancellation also
returns without mutation. Successful association refreshes agent readiness.
Owner-context changes close both drawers and clear their account list.
The shared drawer now uses explicit BANK_ACCOUNT/CREDIT_CARD source types when
provided, retaining its existing heuristic fallback for transaction callers.
Stable source IDs preserve primary/spouse identity even with identical labels.

Verification from frontend, CI=true and NG_BUILD_MAX_WORKERS=2:

```powershell
npm test -- --watch=false --browsers=ChromeHeadless --karma-config=karma.auto-classification.conf.cjs --include=src/app/components/my-agent/*.spec.ts --include=src/app/pages/settings-new/settings-navigation.spec.ts --ts-config=tsconfig.auto-classification-spec.json
npm run build -- --configuration production
```

18/18 focused tests passed, exit 0. Added real-component drawer tests for no
existing accounts, creating an account, returning and associating bank source
9081 with its stable spouse source ID, black button rendering and cancel without
writes. Existing shared reactive-form disabled warnings and Chrome termination
warnings were emitted; the runner completed successfully. Production build
passed with size/CommonJS warnings; full output is ignored at
`.local-ai-dev/auto-classification/account-drawer-build.log`. No backend tests
repeated: no backend/schema/authorization/accounting contract changes. Actual
account writes in the authenticated app remain manual user testing. No main
integration, remote push or environment changes.

## Approved onboarding feature integration (2026-11-21)

Elazar requested merging the updated onboarding worktree into this feature so
required profile information can be completed before classification testing.
Source: codex/agent-onboarding at 072ee194cbe62691efff213fcb7dc508cd277b4f;
target: codex/auto-classification at 1cb645d7. This is a local feature-to-feature
merge, not main integration. The source's untracked backend/journey-timings.local
was preserved and not copied or committed. No lockfile/dependency changes.

Resolved conflicts preserve both profile read/update/authorization ports and the
automatic-classification enqueue callback. The shared onboarding chat, recovery,
thinking feedback and admin-console entry come from the source. The source's
Admin guards are retained; /agent/chat remains authenticated and Settings links
continue to select the explicitly owned business. The prompt snapshot includes
both the profile namespace and automatic-classification tool, reviewed before tests.
No schema, production, accounting, environment or consent changes.

Merged-code verification (logs ignored under .local-ai-dev/auto-classification):
- Backend: node node_modules/jest/bin/jest.js --runInBand --runTestsByPath
  src/agent-onboarding/onboarding-admin.spec.ts
  src/agent-onboarding/onboarding.domain.spec.ts
  src/agent-onboarding/onboarding.service.spec.ts
  src/auto-classification/auto-classification.policy.spec.ts
  src/auto-classification/auto-classification.service.spec.ts
  src/auto-classification/auto-classification.http.spec.ts: 67 passed, six suites.
  npm run build: exit 0.
- Agent npm run typecheck: exit 0 (advisory Effect suggestions). npm run build:
  exit 0, agent-http 477.6 kB. Scoped npm run check on app-agent.ts,
  agent-tool-search.ts, agent-tool-traits.ts, app-agent-tools.ts and GUIDE.md:
  exit 0, including formatting and lint.
- Agent Vitest supported --pool=threads --maxWorkers=1: profile, harness override,
  conversation memory and answer-check suites: 40 passed. Prompt snapshots,
  tool schemas and app-agent-step suites: another 13 passed. These are two focused
  batches on the same functional merge (53 total), not a passing full-suite run.
- Frontend combined ChromeHeadless test run: 59 passed. Included my-agent,
  settings-navigation, onboarding, dev-agent-chat, admin-panel and admin-route
  guard suites. Ignored combined tsconfig extends the feature test config and
  explicitly points typeRoots at frontend/node_modules/@types. Production build
  passed; existing bundle/style/CommonJS warnings remain.
- node --test backend/scripts/local-onboarding-config.test.cjs: four passed.
- git diff --cached --check: passed; no unresolved conflict markers.

Initial verification limitations preserved: unbounded default Vitest parallelism
exhausted memory. A subsequent system Node 24.13 Jest run crashed natively
(-1073741819), and Vitest fork workers stalled/died. No timeout/assertion changes
or security overrides. Successful reruns used installed Node 24.22.3 and supported
single-thread Vitest plus serial Jest. One combined Angular harness attempt failed
type lookup because its ignored config lived outside frontend; corrected only its
typeRoots, then all 59 tests passed. Existing reactive-form/Chrome shutdown warnings
remain. No paid model calls or database integration suites were repeated; source
branch evidence is not presented as a full run on this merged tree.

Safe launcher read-only check confirmed keepintax-dev, port 3000, synchronize off,
and both feature flags already true in the existing ignored environment file.
No main merge or GitHub push. Authenticated user testing remains Elazar's check.

## Local onboarding origin configuration (2026-11-21)

Reported onboarding send failure after integration. Compared environment key
presence against onboarding without exposing values: OPENAI_API_KEY is populated
and identical; optional local Langfuse settings differ. The onboarding launcher
injects permitted origins from its ignored port config; this checkout had neither
that config nor AGENT_APP_ORIGINS. Added only the missing local origin setting in
ignored backend/.env, for localhost:4200 and 127.0.0.1:4200; no existing value,
port, key, flag, database credential or consent overwritten. Did not copy source
worktree ports or optional telemetry keys.

Bounded diagnostic against the built agent HTTP handler: without permitted origin,
the app-origin request returns 403 AGENT_INVALID_ORIGIN. With the local setting,
both permitted origins reach the deliberately invalid-content-type check (415),
while an unrelated origin still returns 403. No model call, new chat, profile
mutation or schema write. This reproduces the configuration defect; the old
browser console retained only a generic failed-chat object, not the historical
HTTP response body. Existing owner's relevant persisted stream had no newer
error chunk, consistent with rejection before message storage, not proof of
a historical model error.

Restarted only the identity-verified feature backend watcher to load the change,
with DB_DATABASE=keepintax-dev, DISABLE_SYNCHRONIZE=true and SKIP_BOOT_SEED=true.
The .env remains ignored. No executable source change or application build/test
repetition needed for this local environment correction; existing compiled handler
provided focused verification. User should retry the actual chat after startup.

## Notice UI and reply usability (2026-11-21)

Completed the eight requested changes: payment source in question cards; bell
row hover/focus; outside-click/focus/Escape dismissal; leftmost document creation,
then settings, then bell; borderless settings trigger; collapsed expandable cards;
explicit unread badge/background; usable reply action when automation is off.
Consent activation is explicit in both CTA and nearby disclosure, never automatic
on typing/expansion. It affects all eligible transactions and still uses owner-only
consent validation. A failed consent request does not send a reply or erase its
draft. Successful replies show pending feedback rather than retaining unanswered UI.

Payment metadata is persisted for future notices and hydrated for existing notices
using one bounded owner-scoped cache/source read. Primary/spouse source identity
is preserved by sourceRecordId. No schema/backfill, accounting change, environment
change or delegated permission expansion. Preserved untracked
backend/journey-timings.local. No agent-package executable files changed.

Verification (Node 24.22.3; frontend CI=true, NG_BUILD_MAX_WORKERS=2):
- node node_modules/jest/bin/jest.js --runInBand --runTestsByPath
  src/auto-classification/auto-classification.service.spec.ts
  src/auto-classification/auto-classification.http.spec.ts: 21 passed, 2 suites.
  Includes owner-scoped historic payment hydration and durable display snapshots.
- npm run build from backend: exit 0. Backend changed-file ESLint: exit 0.
- node --max-old-space-size=4096 node_modules/@angular/cli/bin/ng.js test
  --watch=false --browsers=ChromeHeadless
  --karma-config=karma.auto-classification.conf.cjs --progress=false --source-map=false
  --include=src/app/components/my-agent/*.spec.ts
  --include=src/app/pages/settings-new/settings-navigation.spec.ts
  --include=src/app/components/topNav/topNav.component.spec.ts
  --ts-config=tsconfig.auto-classification-spec.json: 26 passed on final UI.
  Covers collapsed cards/payment/new badge, explicit off-to-on reply, failed consent
  preserving drafts, queued feedback, bell outside/focus/Escape and exact notice
  navigation, borderless settings and existing drawer/navigation regressions.
- node --max-old-space-size=6144 node_modules/@angular/cli/bin/ng.js build
  --configuration=production --progress=false: exit 0, existing size/CommonJS
  warnings retained. No thresholds changed.
- git diff --check: passed. Exact ignored logs: notice-ui-backend-tests.log,
  notice-ui-backend-build.log, notice-ui-frontend-final-tests.log and
  notice-ui-frontend-build.log under .local-ai-dev/auto-classification.

One earlier 26-test frontend run passed before the final queued-feedback addition;
the focused suite was repeated because of that executable change. No broad agent
tests or paid evals repeated. Manual authenticated Chrome inspection was attempted
but blocked by repeated Emulation.setFocusEmulationEnabled CDP timeouts, including
the prior valid tab binding. Supported troubleshooting was read; no session/profile
or authentication data accessed and no unrelated processes stopped. Therefore no
claim of manual visual verification. No real consent/reply was submitted during
verification. No main integration or GitHub push.

## Toolbar and reply button polish (2026-11-21)

Completed the five visual corrections: neutral settings icon color on hover/focus;
physical right-side unread badge in RTL; toolbar gap reduced from 12px to 4px
without space-between/min-width expansion; bell/settings glyphs at 24px while
retaining 44px click targets; reply now uses the shared ButtonComponent with
ButtonColor.BLACK, AUTO size and normal loading/disabled states. Removed the
custom reply background/foreground rules rather than changing application-wide
button styles. Existing focused reply test now targets the shared component's
actual native button. No authorization, backend, schema, environment, classification
or accounting changes. Preserved backend/journey-timings.local.

Verification from frontend, installed Node 24.22.3, CI=true,
NG_BUILD_MAX_WORKERS=2:

```powershell
node --max-old-space-size=4096 node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --karma-config=karma.auto-classification.conf.cjs --progress=false --source-map=false --include=src/app/components/my-agent/*.spec.ts --include=src/app/pages/settings-new/settings-navigation.spec.ts --include=src/app/components/topNav/topNav.component.spec.ts --ts-config=tsconfig.auto-classification-spec.json
node --max-old-space-size=6144 node_modules/@angular/cli/bin/ng.js build --configuration=production --progress=false
```

26 tests passed, exit 0. Production build passed with existing size/CommonJS
warnings. Logs: ignored .local-ai-dev/auto-classification/toolbar-polish-tests.log
and toolbar-polish-build.log. Reviewed scoped CSS and actual shared black-button
contract. No new tests for these reversible styling changes; reused focused
behavioral regressions. git diff --check passed. Backend/agent checks not repeated
because neither changed. Prior manual Chrome connection failure remains a visual
verification limitation; no unsupported browser fallback used. Local feature commit
only, no main integration or GitHub push.

## Explicitly approved local main integration (2026-11-22)

Elazar explicitly requested merging to main. Candidate combines feature e5f31383
with existing local main de8369bc437a0bf87fca6681488d80902ad685b1. Preserved all
existing Gmail/PDF/onboarding changes, including retiring current_need as a required
onboarding field. The only merge conflict was additive docs/redesign/cutover.sql:
retained both existing sections verbatim. No SQL executed, no schema or production
access. Proposed clarification grouping/certainty redesign from the discussion is
not implemented in this integration. Feature tracked files were clean initially;
untracked backend/journey-timings.local remains untouched.

Main-port gate, verified before integration in the primary checkout:
- node frontend/scripts/start-local.js --print-config: frontendPort 4200,
  backendPort 3000, apiUrl http://localhost:3000/, source main defaults.
- node backend/scripts/start-watch.js --print-config: backendPort 3000,
  synchronize false, onboardingEnabled false; backend/.env PORT=3000.
- No ignored ports.json or serve port/host override in main. Existing main local
  environment is preserved: onboarding/automatic classification flags were not
  enabled or copied, nor were any keys. Starting main does not activate automation.
- git fetch origin refreshed metadata only. The pre-existing local/remote main
  divergence (105 local/19 remote commits) was not resolved by importing unrelated
  remote work. No remote push is authorized or attempted.

Merged candidate verification, using installed Node 24.22.3 for direct Node checks:
- npm ci --no-audit --no-fund independently in backend/frontend: exit 0. First
  backend attempt hit EPERM on its loaded Sharp DLL; stopped only identity-verified
  feature backend/frontend, then retried successfully. No other servers stopped;
  no security bypass or shared node_modules. Legacy dependency/engine warnings
  retained. No lockfile/source changes from installation.
- Backend Jest --runInBand --runTestsByPath: onboarding admin/domain/service,
  all four automatic classification policy/service/model/http suites, agent
  classification transaction/service, retention, effective classification and
  classification permissions: 121 passed, 12 suites. Node Nest CLI build: exit 0.
- Agent npm run typecheck: exit 0 (existing advisory Effect suggestions).
  Vitest run --project unit --pool=threads --maxWorkers=1 with profile, prompt
  snapshots, tool schemas, harness override and answer-check suites: 47 passed,
  five files. npm run build: exit 0. No paid evals or live model calls.
- Angular combined ChromeHeadless --watch=false --progress=false --source-map=false
  with karma.auto-classification.conf.cjs and the ignored combined tsconfig:
  my-agent, settings-navigation, topNav, onboarding, dev-agent-chat, admin-panel
  and admin-route guard suites: 67 passed. Production build with
  --max-old-space-size=6144 --configuration=production --progress=false: exit 0.
  CI=true, NG_BUILD_MAX_WORKERS=2. Existing size/CommonJS warnings retained.
- node --test backend/scripts/auto-classification-schema.test.cjs
  backend/scripts/local-onboarding-config.test.cjs: 12 passed; pure guards, no SQL.
- git diff --cached --check: passed. Reviewed the feature delta against main:
  no real .env, generated output or node_modules included. Native source/compiled
  checks ran on the combined candidate; no executable edit after passing checks.
  The merge commit adds only this verification prose after the tested tree.

Full evidence is ignored under .local-ai-dev/auto-classification/main-integration-*
(install logs, backend tests/build, frontend tests/build, agent typecheck/tests/build).
No claim of a new full-repository suite, MySQL integration run or authenticated
manual main test. Local main may fast-forward only to this tested descendant while
the primary checkout stays clean and at the recorded base. Main integration is
approved; GitHub push remains prohibited pending Elazar's personal current-main
test and separate explicit approval. Feature test servers were stopped for install;
no main server, deployment or background classification was started by integration.
