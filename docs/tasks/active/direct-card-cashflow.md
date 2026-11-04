# Direct-card cashflow imports and opt-in exclusion

- Status: WORKER_COMPLETE — local implementation; manual DB/UI validation pending.
- Task manager and implementer: Codex, single isolated feature worktree.
- Branch: codex/direct-card-cashflow
- Base commit: 4570bede (origin/main fetched 2026-11-04).
- No push, deployment, production access or main integration performed.

## Acceptance criteria

- [x] Import known Direct cards normally, including explicit retry; retain card-kind readiness and consent verification.
- [x] Immutable SYSTEM subcategory with stable identity, available under an overridden parent.
- [x] Owner-only server-persisted boolean preference, false by default; narrow update preserves concurrent connection state.
- [x] Exclude classified owned BANK_ACCOUNT rows from lists, aggregates, pending archives/previews and direct approval endpoints.
- [x] Keep classification/source provenance across cache rebuilds; preserve existing bill-wide rule matching, identity and backfill across sources.
- [x] Inspect/reclassify excluded rows; opt-out restores visibility. Refresh cached lists/charts on saved preference changes.
- [x] Sync failures stay independent; synthetic demo covers both states without provider calls.
- [x] Prepare manual SQL, append it to cutover.sql and document rollout/limits.

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
