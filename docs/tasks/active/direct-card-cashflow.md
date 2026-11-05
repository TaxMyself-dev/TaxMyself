# Direct-card cashflow imports and opt-in exclusion

- Status: LOCAL_MAIN_VERIFICATION_PENDING — approved local integration; no push authorized.
- Task manager and implementer: Codex, single isolated feature worktree.
- Branch: codex/direct-card-cashflow
- Base commit: 4570bede (origin/main fetched 2026-11-04).
- Local main integration authorized 2026-11-05. No push, deployment or production access.

## Acceptance criteria

- [x] Import known Direct cards normally, including explicit retry; retain card-kind readiness and consent verification.
- [x] Immutable SYSTEM subcategory with stable identity, available under an overridden parent.
- [x] Owner-only server-persisted boolean preference, false by default; narrow update preserves concurrent connection state.
- [x] Exclude classified owned BANK_ACCOUNT rows from lists, aggregates, pending archives/previews and direct approval endpoints.
- [x] Keep classification/source provenance across cache rebuilds; preserve existing bill-wide rule matching, identity and backfill across sources.
- [x] Opt-out restores visibility for inspection/reclassification; no show-excluded checkbox. Refresh cached lists/charts on saved preference changes.
- [x] Sync failures stay independent; synthetic demo covers both states without provider calls.
- [x] Prepare manual SQL, append it to cutover.sql and document rollout/limits.

## Local main integration — 2026-11-05

Elazar explicitly requested integration into local main for personal testing and
forbade GitHub push. Preserved his final popup/settings copy in 1ab0765c and merged
current local main 99e604b0 into the feature at 3880d3bf. Resolved additive topic
documentation and combined the Direct popup with main's full-sync retry binding.
Removed main's old explicit Direct-skip guard while retaining permanent source-ID
lookup, consent-aware selection and error handling. Updated three obsolete test
expectations to normal Direct imports/not_synced discovery; no product behavior
was broadened during integration.

Verification on the merged tree: 23 backend suites / 277 tests passed across
banking/classification/demo and report/expense checks (the two old-expectation
suites reran green after correction). Six frontend suites / 59 ChromeHeadless
tests passed. Nest build passed using an isolated output directory to avoid
disturbing the watch server; Angular production build passed with existing
CSS/bundle budget and CommonJS warnings. SQL copies match; no generated files,
environment files or secrets are included. No live provider, DB or production
operation was needed during integration. Dev SQL was already applied earlier.

Feature and main are retained locally for Elazar's personal main verification.
Real Direct-card feed coverage still needs his connected-account check. No remote
push is authorized until he tests this current main revision and explicitly approves.

## Validation

- Backend regression: 13 suites / 134 tests passed (permissions, source identity, report-review identity/focus, readiness and changed areas).
- Final backend changed-area run: 9 suites / 126 tests passed (SQL predicate in memory, approval guards, catalog immutability/parent override, durable archive, Direct imports/retries and demo).
- Backend Nest build: passed, exit 0.
- Final frontend: 21 focused UI tests passed in ChromeHeadless (port 9889); Angular production build passed (exit 0), with bundle/CSS budget and CommonJS warnings.
- Final Git whitespace check passed. Dependency trees were installed independently; environment files remain ignored and are not part of the change.
- SQL tests use Node 24 in-memory SQLite and do not replace a MySQL rehearsal.
- Jest uses --forceExit because imported dependencies retain handles. Provider error logs are mocked failure scenarios.
- No live DB/provider calls, SQL execution or app boot against environment credentials.

## Impact and manual checks

Schema: new preference, permanent notice-dismissal flag, catalog systemKey/index, cache classification ID and slim source provenance (five columns, one unique index). No classified_transactions.sourceRecordId. Script: docs/features/direct-card-cashflow.sql; also appended to docs/redesign/cutover.sql. Existing rule/slim classification columns reused.

Security: Firebase and existing owner/represented-client boundary; selected category IDs validated in tenant catalog. No broader delegation permission.

Accounting: no historical Expense/journal mutation or account-code changes. New label is operational/private without a booking account. Opt-in affects operational cashflow and pending approval; historical bank approvals are not transferred to card IDs.

Before release: rehearse SQL on non-production MySQL, test actual card coverage/refresh and classification, and review previously approved bank/card duplicates. Elazar must personally test the current local main revision and explicitly approve any GitHub push.

Documentation: feature guide, standalone/cumulative SQL and nearest affected topic AGENTS files.

## Rule-scope correction (2026-11-04)

Elazar requested preserving ordinary classification rule behavior. Removed the
source predicate from rule identity, matching and backfill, and removed
classified_transactions.sourceRecordId from the entity and both SQL copies.
Slim source provenance and the bank-only exclusion policy remain unchanged.

Validation: five backend suites / 40 tests passed, including cross-source matches
within the same bill, rejection of another bill/merchant/amount condition, source-free
rule lookup/backfill, exclusion/approval and Direct import regressions. Nest build
passed (exit 0). Standalone and cumulative SQL blocks match exactly and contain no
classified_transactions ALTER. No frontend files changed, so UI tests/build were
not repeated for this correction. No DB operations or GitHub push performed.

## Direct label parent correction (2026-11-04)

Elazar requested the SYSTEM Direct label under בנק, אשראי ותנועות. Seed and
standalone/cumulative SQL now use that parent; reruns move the existing label
without changing its stable ID. No classification rule scope change.

Verified on keepintax-dev: label ID 109 is under בנק, אשראי ותנועות. Updated
SQL ran twice successfully; user, transaction and rule counts were unchanged.
Two focused backend suites / 18 tests passed; Git whitespace check passed.
No production access or GitHub push performed.

## Direct-card discovery and reminder follow-up (2026-11-04)

Settings now offers the exclusion control only when the owner has a source
with sourceType=CREDIT_CARD and isDirect=true. Unknown card type and bank
descriptions do not imply eligibility. Existing exclusion preferences are retained.

Implemented dashboard popup with the same checkbox, X/Close, remind next login
(Elazar's selected timing), and persistent never-show-again. Elazar approved only
the directCardNoticeDismissed user column and requested reusing lastLoginAt for
reminders. Temporary suppression is a per-UID browser marker of that login;
permanent suppression is server-backed and independent of cashflow exclusion.
Owner-only dismissal endpoint and generic-profile write protection added.

Approved SQL applied twice to keepintax-dev: directCardNoticeDismissed defaults to
0, label remains ID 109 under בנק, אשראי ותנועות, and user/transaction/rule counts
remain unchanged. No production operations or GitHub push.

Validation: backend two focused suites / 20 tests passed; frontend four focused
suites / 30 tests passed in ChromeHeadless, including next-login semantics,
failed saves, identity changes and represented-client restrictions.
Backend build and frontend production build passed (existing CSS/bundle budget
and CommonJS warnings). Final Angular template compilation and the 30 frontend
tests passed after wiring successful popup saves to dashboard refresh. SQL copies
match exactly; Git whitespace check passed. Live UI/provider verification remains
manual, and no local integration into main or GitHub push was performed.

## Demo PRIMARY-key collision correction (2026-11-04)

Elazar reported Duplicate entry 9706 for full_transactions_cache.PRIMARY while
creating direct-card-demo. TypeORM's first bank-row insert assigns generated IDs
back onto cacheRows; the subsequent card-twin spread incorrectly copied those
IDs into a second insert. buildLegacyDuplicateRows now omits the bank primary key.
The orchestration regression supplies already-inserted bank IDs and requires all
card inserts to omit id while preserving the original bank IDs. No schema or
existing database records changed by this correction.

Validation: three Direct-demo backend suites / 29 tests and Nest build passed;
Git whitespace check passed. No live seed/provider call or GitHub push performed.

## Demo popup discoverability (2026-11-04)

Elazar reported no popup and a checked/disabled control. The seed had exclusion
enabled, suppressing the popup; the admin demo-entry shortcut uses view-as, which
intentionally disables owner writes and suppresses the popup. Fresh/reset demo
now starts with exclusion off, while the explicit apply-fix action enables it.
Settings explains view-only state and directs testers to a real demo-owner login.
The existing synthetic Direct-demo user in keepintax-dev was updated from exclusion
on to off after verifying its unique demo email and synthetic Direct-card source;
its permanent notice dismissal remained false. No other users or transactions
were changed, and no authorization exceptions were introduced.

Validation: three backend demo suites / 30 tests and Nest build passed. Frontend
change is explanatory text using the existing view-as predicate. No GitHub push.

## Demo email login validation (2026-11-04)

The login/password-reset regex rejected both + aliases and suffixes longer than
three characters, making demo+direct-card@taxmyself.local impossible to submit.
Both controls now use required + Angular Validators.email. Existing demo identity
and Firebase authentication remain unchanged. Regression exercises the actual
LoginPage form with the demo credentials, ordinary aliases/long suffixes and
malformed/empty addresses. No DB or backend build/start operations required.
Validation: nine login-form regressions passed in ChromeHeadless and Git whitespace
check passed. Saved locally only; no GitHub push.

## Popup routing activation correction (2026-11-04)

Elazar still saw no popup on the transactions page. Root template uses a normal
Angular router-outlet; relying on ionViewWillEnter left dashboard notice active
false. Dashboard and component now start active on normal Angular initialization;
the same notice is mounted on Transactions with existing owner/consent/sync guards.
Shared per-login suppression prevents repeated prompts after closing either page.

Verified current dev demo flags read-only: exclusion=false, dismissal=false.
Fourteen focused UI tests passed, including normal Angular initialization without
Ionic lifecycle events. In the user's existing localhost browser session, navigated
to transactions and reloaded: popup visibly appeared with unchecked enabled checkbox,
X, Close, Remind Later and Never Show Again. Left popup open without changing any
preferences. No backend build/restart or DB mutation was needed for this correction.
Frontend production build passed with existing CSS/bundle budget and CommonJS
warnings. No integration into main or GitHub push performed.

## Classification upsert physical-column correction (2026-11-05)

Elazar reported Unknown column subCategoryId in field list during classification.
Read-only metadata inspection verified the expected dev schema: slim/cache use
sub_category_id, while rules use subCategoryId. QueryBuilder.values() mapped the
property names correctly, but dynamically generated orUpdate() lists incorrectly
passed property names as physical columns. Both slim classification writes and
cache rebuild upserts now map update columns through repository metadata.
No schema/data mutation or backend dist build/restart was needed. Existing
uncommitted popup/settings copy edits by Elazar are preserved and excluded from
this correction's commit. The cashflow show-excluded checkbox is unchanged; it is
a temporary inspection filter, independent of the permanent exclusion preference.

Validation: five backend suites / 28 tests passed, including real MySQL SQL
generation for classification/document columns and cache refresh column names.
Backend TypeScript noEmit check passed without touching dist. Retention regression
now permits the existing provenance-only archive healing while asserting no
classification mutation. Git whitespace check passed; no GitHub push performed.

## Remove cashflow show-excluded control (2026-11-05)

At Elazar's request removed the show-excluded checkbox from cashflow and its local
toggle state/handler. Income/expense reads use the existing default exclusion
policy. Permanent exclusion settings and the explanatory opt-in popup are unchanged.
Existing uncommitted copy edits are preserved separately. No backend or DB changes.

## Demo bank provenance and exclusion repair (2026-11-05)

Elazar classified bank Direct payments and enabled exclusion, but they remained
visible. Read-only dev inspection confirmed preference=true and stable category
109 on both slim/cache, while initial-seeded bank cache rows lacked sourceRecordId.
The bank-only guard correctly kept unknown-provenance rows visible. Direct demo
source-state setup now resolves all fixture payment identifiers and persists missing
bank-source IDs before cloning card twins. Regression starts with null bank source
IDs and checks that bank IDs are persisted and card twins keep their own source.

Repaired only the existing synthetic Direct-demo user's missing links in keepintax-dev:
13 cache rows and five classified slim rows linked to its unique owned synthetic
bank Source. No amounts/classifications/preferences were changed. The actual shared
cashflow SQL predicate now excludes exactly five of its 18 cache rows. No schema
change or production data access. Three suites / 33 tests and backend noEmit type
check passed; existing UI copy edits remain separate. No GitHub push.
