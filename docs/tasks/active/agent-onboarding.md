# Agent onboarding and persistent profile

- Status: DEVELOPMENT_VERIFIED_NOT_INTEGRATED
- Task manager: Codex
- Worktree: TaxMyself-agent-onboarding
- Branch: codex/agent-onboarding
- Base commit: c0a37b21 (new-ai-assistant, includes current main ea5ba2b3)

## Business outcome

Build the first onboarding conversation and interface from the agreed profile,
narrative, MySQL memory and history specification. Continue the existing AI
feature in isolation; preserve its untracked planning documents.

## Acceptance criteria

- Free narrative and guided questions fill basic fields without repeating known data.
- Personal and business facts, stories and dated history are kept separately.
- Server-side preview, version checks, transactions and idempotent confirmation.
- Corrections differ from transitions; partial dates stay partial.
- UI shows current knowledge and history and supports updates and forgetting.
- Ordinary agent chat receives owner-scoped profile context without starting onboarding.
- Owner/delegation boundaries and disabled-feature behavior are tested.

## Boundaries

No accounting changes, background reviews, production access, deployment, main
integration or push. New SQL was initially authored for review, then explicitly authorized for keepintax-dev only. Production databases remain excluded. The user requested backend and UI implementation of the agreed schema.
Personal main-integration and push gates override repository automatic delivery.

## Verification and handoff

Initial implementation checks were completed at 8477fbdd. Database execution was subsequently explicitly approved by Elazar for keepintax-dev only; main integration and push remain prohibited. An isolated npm install was required per package.
Frontend npm ci initially failed on three missing optional undici-types 8.9.0
lock entries. npm install --package-lock-only fixed those entries without
changing package.json. Existing frontend Node engine declaration prefers Node
20 while the host uses Node 24; successful build/test results must be recorded
rather than claiming that warning was resolved.

Local Docker's Linux engine was unavailable. The initial implementation did not use a shared database as a substitute. Elazar later explicitly authorized keepintax-dev for schema execution and end-to-end persistence verification.

## Initial implementation evidence before database authorization

- backend: npm run build — exit 0 on final executable changes.
- backend: npm test -- --runInBand --runTestsByPath src/agent-onboarding/onboarding.domain.spec.ts src/agent-onboarding/onboarding.service.spec.ts src/agent-onboarding/onboarding.mysql.spec.ts — exit 0, 22 passed, 6 explicitly skipped (local MySQL URL absent).
- Existing agent-harness controller/access tests — 18 passed earlier in the same feature; their inputs remain unchanged. This is reused focused evidence, not a single combined final-revision run.
- frontend: npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/pages/agent-onboarding/*.spec.ts --ts-config=tsconfig.onboarding-spec.json — exit 0, 8 passed in ChromeHeadless 157, including actual template rendering and native dialog behavior. Chrome needed forced termination after successful completion; no test failed.
- frontend: npm run build -- --configuration production — exit 0 on final executable frontend changes. Existing-file style budgets, CommonJS optimization and the 3.20 MB initial bundle warnings remain; no broad baseline suite was run or claimed green.
- backend/agent: npm run typecheck — exit 0, existing Effect suggestions only.
- backend/agent: npm run check — exit 0 after fixing authored formatting and formatting the touched GUIDE.
- backend/agent: npm test -- --maxWorkers=2 --reporter=dot — exit 0, 365 passed, 22 skipped, 67 files passed and 3 skipped. The first broader parallel run had one 5-second Git-state timeout; its isolated rerun and this full bounded run passed without changing its threshold.
- backend/agent: npm run build — exit 0.
- The prompt snapshot mismatch was reviewed: only the new onboarding context source and dedicated onboarding instructions changed. Updated that snapshot, then the complete agent unit suite passed.
- Bounded real-model diagnostics used synthetic text. They exposed joined/ellipsized source evidence and loss of simultaneous home/office context. Changed the schema to exact quote arrays and structured workplace modes, preserved month precision and added deterministic server-side date clarification. Rechecked only affected cases. The model itself did not reliably ask for a date; the backend now enforces that boundary and its unit test passes. These are diagnostics, not a statistically validated model-quality evaluation.
- No MySQL server was contacted, no SQL applied and no full authenticated onboarding-to-database journey executed. Docker's Linux engine was unavailable. Six disposable-local-MySQL tests remain skipped; no claim of persistence integration verification is made.
- New schema affects only five agent_onboarding tables. No accounting entity/report behavior, production service, main checkout or remote ref was changed. Frontend onboarding is behind the existing agent development-route flag; backend activation is opt-in through AGENT_ONBOARDING_ENABLED.
- Profile updates use the dedicated onboarding conversation. Ordinary chat consumes context but does not write these profiles via legacy memory tools. Forgetting covers onboarding memory and its stored sources/versions, not ordinary chat transcripts or backups.

## Approved development verification follow-up

Elazar explicitly approved applying the schema to keepintax-dev and completing
end-to-end persistence tests, and explicitly prohibited main integration and
push. That authorization does not extend to production.

The guarded schema runner selected keepintax-dev on MySQL 8.0.37-google, found
zero existing onboarding tables, created all five and verified 20, 9, 7, 17 and
6 columns respectively. SQL SHA-256:
0c3671a4c539854f591464c41761eafab6b198d929f78989e20d95d45a90fe3a.
A later --check found all five tables and the same SQL hash. No existing
accounting table was altered and no full Nest application or boot seeder ran.

First database sample: all 10 direct-service persistence tests passed, including
month precision, correction versus transition, repeat confirmation, cross-owner
isolation, existing-data registration seeding, simultaneous competing commits,
late-failure rollback, expiry and forgetting. All synthetic owner data was
cleaned by the suite.

First HTTP sample: five deterministic cases passed; the real-model case exposed
a material omission of a future plan from the extracted summary. The source
message itself was stored. Fixed the data path, rather than relaxing extraction
thresholds: story.narrative now exposes the original dated user story and the
ordinary agent context includes it independently of lossy summary facts. The UI
shows it under the original-story panel. Confirmed current facts retain
precedence over source quotations; forgetting also scrubs affected source text.
Added a deterministic regression that deliberately omits a plan from extraction
and requires its exact original text in reloaded story and agent context.

The first post-fix smoke still checked only the former summary fields; updated
that assertion to inspect the added narrative layer while retaining workplace,
month, personal-name, reload and context assertions. A combined Jest process
later printed a passing HTTP suite but ended without a complete result report;
it is not counted as a successful combined run. The runner now supervises each
suite in a separate process and records exit status, signal, JSON and logs.

A later captured model output identified the intermittent validation failure:
the model wrote `[...]` in an evidence string despite quote instructions. Fixed
the tool contract instead of loosening the validator: model evidence is now an
enum of server-generated source IDs, resolved server-side to exact contiguous
quotes. Added rejection tests for invented IDs/quotes and a 200-segment bound.
Invalid model output also has a fail-closed clarification path: no malformed
facts are written and the original user story remains available after commit.

One intermediate HTTP run encountered a remote MySQL ECONNRESET and a 5-second
test timeout. These failures were recorded, not suppressed; the affected HTTP
suite was rerun after the source-contract fix without increasing its timeout or
changing persistence/isolation criteria. The final HTTP run passed all eight.

## Final development verification results

All commands ran in this feature checkout with no executable changes after the
final applicable checks. Database suites ran separately to avoid repeating paid
model smoke calls unnecessarily. This is two bounded final runs totaling 18 DB
tests, not a claim that the previously incomplete combined process passed.

- `node backend/scripts/run-onboarding-dev-tests.cjs --database=keepintax-dev --http-only` — exit 0; 8 passed, 0 failed, 0 skipped. Report: `.test-tmp/onboarding-dev/onboarding.http-mysql-1795090285682.json`.
- `node backend/scripts/run-onboarding-dev-tests.cjs --database=keepintax-dev --persistence-only` — exit 0; 10 passed, 0 failed, 0 skipped. Report: `.test-tmp/onboarding-dev/onboarding.mysql-1795090426114.json`.
- Each suite cleaned only its UUID-scoped synthetic owners and asserted no remaining owned rows. A final independent read-only query counted 0 QA rows in profiles, proposals, changes, facts and story versions. No test user/business rows were inserted into accounting tables.
- Backend `npm test -- --runInBand --runTestsByPath src/agent-onboarding/onboarding.domain.spec.ts src/agent-onboarding/onboarding.service.spec.ts` — exit 0; 27 passed, 0 skipped.
- Backend `npm run build` — exit 0 after the final evidence-ID contract change.
- Frontend `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/pages/agent-onboarding/*.spec.ts --ts-config=tsconfig.onboarding-spec.json` — exit 0; 9 passed, including the original-story regression.
- Frontend `npm run build -- --configuration production` — exit 0 on the final frontend code. Existing-file style/bundle/CommonJS warnings remain; no unrelated warning cleanup was attempted.
- `node --test backend/scripts/onboarding-test-target.test.cjs` — exit 0; 4 passed. Production-name/config mismatches and unscoped cleanup are rejected before SQL.
- `node backend/scripts/apply-agent-onboarding-schema.cjs --database=keepintax-dev --check` — exit 0; all 5 tables present, original SQL hash unchanged.
- Existing agent package typecheck/check/build and 365 passing agent unit tests from the initial feature were reused: backend/agent files did not change in this follow-up. They were not rerun or presented as a new combined final-revision run.

HTTP coverage includes the real controller, DTO validation, real FirebaseAuthGuard
logic, transactions and MySQL plus one real model extraction. Token verification
and the synthetic account directory are fixtures, so this is not a claim of a
full real-Firebase browser sign-in journey. The UI was exercised separately in
ChromeHeadless. Feature activation still uses the documented opt-in flag; no
existing server was restarted and no deployment ran.
Local main integration and remote push remain separate, unapproved gates.
Automated development tests are not Elazar's manual main verification.


## Normal application entry follow-up

User authorized connecting onboarding to ordinary application entry, with an
incomplete-profile popup and permanent resume link, in the same worktree.
Explicit boundaries: do not start application servers, integrate main or push.

Added the canonical AuthGuard-protected /agent/onboarding route and a legacy
redirect. The normal app menu includes the owner-only resume link. The shell
hosts one invitation, outside its routed flex layout; the old dev-page host was
removed. It waits for startup/billing and existing overlays, cancels stale owner
requests and is hidden during represented-client access. A per-owner, per-sign-in
sessionStorage marker prevents repeated invitations on every navigation. The
server computes completion per business, independent of shared invitation state.

The screenshot showed AGENT_ONBOARDING_ENABLED being absent/false in the running
backend. Added a tested optional boolean in the existing ignored local port
configuration, consumed by the canonical watch launcher. The dry run confirms
onboarding enabled on backend 3004 and frontend 4204 with API target 3004. No
existing .env was overwritten. An already-running backend must be restarted by
the user to receive the new flag. No application server was started or stopped.

Verification is recorded below when the final focused checks finish. No schema,
accounting, authentication or delegation policy change; no live DB verification
was repeated for this shell/status-only change. Previous persistence evidence
remains documented separately.

### Final ordinary-entry verification

- Backend `npm test -- --runInBand --runTestsByPath src/agent-onboarding/onboarding.service.spec.ts src/agent-onboarding/onboarding.domain.spec.ts`: exit 0, 29 passed, 0 skipped. Covers completion of separate owned businesses even when the shared invitation is already completed.
- Backend `npm run build`: exit 0. No backend code changed after this check.
- `node --test backend/scripts/local-onboarding-config.test.cjs`: exit 0, 4 passed; unset local config preserves defaults, local true enables, process override wins and invalid local flags fail closed.
- `node backend/scripts/start-watch.js --print-config`: backendPort 3004, synchronize false, onboardingEnabled true, ignored local config. `node frontend/scripts/start-local.js --print-config`: frontendPort 4204, backendPort 3004, apiUrl http://127.0.0.1:3004/. These commands were configuration-only; no application server was started.
- Frontend `npm --prefix frontend test -- --watch=false --browsers=ChromeHeadless --include=src/app/pages/agent-onboarding/*.spec.ts --ts-config=tsconfig.onboarding-spec.json`: exit 0, 20 passed on final tests. Covers normal owner entry, partial completion, a second incomplete business, completed users, per-login dismissal, cancellation on owner change, disabled/offline behavior, navigation eligibility and waiting for another visible dialog.
- The overlay test initially waited only for Angular stability and checked before the native MutationObserver event. Reviewed the failure; changed the test to wait for the actual dialog open attribute, without changing the UI requirement or increasing a timeout. All 20 then passed. The final production frontend build preceded only this test-only adjustment; executable inputs remained unchanged.
- Frontend `npm run build -- --configuration production`: exit 0 on final executable source. Existing-file style budgets, CommonJS notices and the initial 3.21 MB bundle warning remain. No unrelated cleanup or full legacy frontend suite was attempted.
- No application server, real-user browser login, paid model eval or live database test was started in this follow-up. Test-runner browser infrastructure is separate from application development servers. No schema or accounting data change.
- The canonical route is /agent/onboarding and the regular menu label is ההיכרות שלי עם הסוכן. The old /dev/agent/onboarding URL redirects, preserving existing links. Main integration and push remain prohibited.

## 2026-11-19 — Continuous onboarding chat and final summary

Acceptance: the onboarding page and long memory summary scroll in the app shell;
invitation introduces the smart Keepintax agent; users converse without confirming
every message; current follow-up appears as composer guidance; remembered facts
appear on explicit finish with a return-to-chat action; existing system controls
are reused. Same worktree/branch, no application servers, main integration or push.

Implemented automatic propose/commit per message using the unchanged server-side
proposal, transaction, version and idempotency contract. Failed commits retain the
proposal ID for retry and the unsent draft. Conflicts clear stale pending proposals
and preserve text for refresh. Skip/finish cannot discard an unsent draft. The
summary preserves the original narrative, basic field status and historical facts;
missing basics remain visible as incomplete. The invitation and forgetting dialog
use PrimeNG Dialog and shared app-p-button; select and textarea use existing
PrimeNG controls. The entire page owns vertical scrolling and new replies scroll
the chat to the latest response.

Verification on the final executable changes based on b6bb29c3:
- Frontend `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/pages/agent-onboarding/*.spec.ts --ts-config=tsconfig.onboarding-spec.json`: exit 0, 23 passed, 0 skipped. Covers autosave, opaque-ID retry, conflicts/draft retention, end-only summary, original story, contextual placeholder, invitation lifecycle and real long-summary scrolling at container widths 800px/360px.
- Scroll test diagnostic: initial runs had zero layout dimensions. Inspected computed styles and found Ionic's unhydrated test document body was display:none. The fixture now temporarily displays the test document, mounts a bounded viewport, measures actual scroll overflow and positive scrollTop, then restores document styles. Assertions were preserved; no snapshot/threshold relaxation.
- Frontend production build: final result recorded below.
- Backend executable source, API contracts, schema, accounting data, authentication and tenant rules: unchanged. Backend/DB/paid-model checks were not repeated for this frontend-only change. Full legacy frontend suite and authenticated live-browser flow were not run. Existing prior persistence evidence is separate.
- No app development server was started/stopped. No main integration or remote push.
- Final frontend `npm run build -- --configuration production`: exit 0, build hash 8e0fae0f3878df24, 94.6 seconds. Existing unrelated style-budget, CommonJS and 3.21 MB initial-bundle warnings remain. This build and the 23-test pass both cover the final executable inputs; only task documentation changed afterward. Complete diff reviewed and `git diff --check` passed.


## 2026-11-19 — Natural, goal-directed introduction conversation

Base: local feature commit 46603f71, same codex/agent-onboarding worktree.
Acceptance: no guidance/skip controls; Send, Enter-to-send and Shift+Enter newline;
guidance/unknown answers through chat; legitimate recall questions answered in
context; unrelated requests redirected to the main agent; one second-person story
with meaningful transition dates but no storage metadata or duplicated source-log
section; basic details visible in personal/business groups.

Implemented: extraction includes a validated intent. Response planning receives
updated prospective fields/facts rather than stale gaps. Guidance, explicit
deferral and off-topic messages are routed consistently. Historical replacements
and corrections remain distinguishable in response context. Replies use the
existing opaque proposal/atomic commit and idempotency path. Invalid extraction
requests rephrasing instead of repeating an unrelated basic question. Original
speech is retained internally. No schema or accounting table change. New
owner-scoped, version-checked POST summary generates a display-only narrative
without overwriting canonical memory. Configurable model defaults/call counts are
documented in the onboarding README; existing authorization applies.

Frontend: shared buttons/PrimeNG controls, one composer action, keyboard/IME
handling, one narrative and always-visible personal/business basics. English
boolean answers display in Hebrew. Source logs/recording metadata are hidden.
Summary failures preserve chat; forgetting invalidates/regenerates the narrative.

Verification on final executable inputs:
- Backend `npm test -- --runInBand --runTestsByPath src/agent-onboarding/onboarding.service.spec.ts src/agent-onboarding/onboarding.domain.spec.ts src/agent-onboarding/onboarding.extractor.spec.ts`: exit 0, 44 passed, 0 skipped, 34.8 seconds. Covers reply selection, prospective-state context, intent routing, natural deferral, summary version checks, original context and model failures. One earlier assertion expected הסוכן הראשי while the correct text was לסוכן הראשי; reviewed and corrected that assertion without weakening the redirect requirement.
- Frontend `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/pages/agent-onboarding/*.spec.ts --ts-config=tsconfig.onboarding-spec.json`: exit 0, 27 passed, 0 skipped. Covers Enter/Shift+Enter/IME, one composer action, no guidance/skip buttons, async summary/failure, no duplicated source log, visible grouped basics, Hebrew booleans, idempotent retry, draft retention, invitation lifecycle and actual long-summary scrolling at widths 800/360px. No frontend executable change followed this pass.
- Backend `node scripts/onboarding-conversation-smoke.cjs --run-paid-model-smoke`: exit 0, seven final synthetic cases passed through real propose with DB writes mocked. Cases: name/employment without invented start dates or repeated name question; guidance; recall after guidance; natural deferral; support referral; month-precision office transition retaining home work; one natural summary without storage metadata. Final total: 18,781 input tokens, 535 output tokens; extraction gpt-4.1-mini, conversation/summary gpt-4.1. These bounded checks are evidence, not exhaustive model-accuracy claims.
- Earlier bounded diagnostics were reviewed: the first design failed off-topic routing and manually showed redundant questions/speculative filler; the separated-response revision still failed deferral/support referral. Those concrete contract defects led to explicit intent routing and prospective-state context. An intermediate seven-case pass preceded final source-aware refinements; the final seven-case pass above covers current executable inputs. A helper path-alias setup failure occurred before any model request; the reusable helper registers existing aliases.
- Final builds are recorded below after completion. Prior persistence/HTTP-MySQL evidence remains separate: no live DB, accounting data or schema operation ran in this follow-up. No app server was started/stopped, no authenticated browser session was used and the full legacy frontend suite was not run. No main integration or remote push.
- Final backend `npm run build`: exit 0. Final frontend `npm run build -- --configuration production`: exit 0, build hash ba751c6563b50508, 40.4 seconds. Existing unrelated style-budget, CommonJS and initial 3.21 MB bundle warnings remain. The final test/model/build evidence covers the same executable inputs; only documentation changed afterward. Complete diff reviewed and git diff --check passed.


## 2026-11-19 — Remove repeated placeholder and support chat deletion

Base: debeec86, same codex/agent-onboarding worktree. Acceptance: no textarea
placeholder/repeated assistant text; the screenshot's delete-all and employment
deletion requests perform erasure rather than off-topic referral or an opposite
employment claim. Preserve ordinary factual corrections and tenant boundaries.

Implemented explicit forget_all/forget_facts intents and validated existing target
IDs. Both use the existing propose/commit path. Selective deletion shares the UI
erasure routine, including prior field versions/corrections and source redaction;
old assistant recaps are hidden to prevent forgotten information resurfacing.
Delete-all is owner-wide across onboarding businesses and leaves accounting/main
chat/backups untouched. Commit locks owner profiles in sorted order and retains
only a content-free receipt/current applied proposal marker for retries. Ambiguous
targets ask which detail, never silently delete everything. No new schema.
The confirmation text is shown only after successful commit. The original user's
real records were not manually altered while diagnosing the screenshot.

Verification:
- Backend `npm test -- --runInBand --runTestsByPath src/agent-onboarding/onboarding.service.spec.ts src/agent-onboarding/onboarding.domain.spec.ts src/agent-onboarding/onboarding.extractor.spec.ts`: final exit 0, 48 passed, 0 skipped. An earlier assertion still expected the two-profile lock parameter list; reviewed and updated it to the new all-owner profile lock, retaining the lock-before-proposal requirement.
- Frontend `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/pages/agent-onboarding/*.spec.ts --ts-config=tsconfig.onboarding-spec.json`: exit 0, 27 passed, 0 skipped; the former placeholder test now verifies a blank textarea with no placeholder attribute.
- `node backend/scripts/onboarding-conversation-smoke.cjs --run-paid-deletion-smoke`: exit 0, three targeted synthetic cases passed (delete all, forget employment, genuine correction). DB writes mocked. 8,385 input tokens, 171 output tokens. The unchanged seven-case paid suite was not repeated.
- `node backend/scripts/run-onboarding-dev-tests.cjs --database=keepintax-dev --persistence-only`: first run 12 passed/1 failed due the existing simultaneous-confirmation test's 5-second timeout under competing compilers. All three new actual-MySQL tests passed: employment/history/recap erasure with unrelated facts retained, rollback on receipt failure, and owner-wide erasure with another owner preserved and retry idempotency. The suite is repeated without competing compilers, with the timeout and assertions unchanged; final result recorded below.
- Test doubles for the existing HTTP-MySQL and persistence suites now implement the separate respond stage introduced in the prior change. No app server or HTTP suite was started in this follow-up. Only exact synthetic test owners were written in the already authorized keepintax-dev database. No real-user deletion, production access, main integration or push.
- Persistence repeat: the same guarded --persistence-only command passed all 13 tests, 0 failed/0 skipped, with unchanged timeouts/assertions and no competing compilers. Guarded cleanup verified zero rows for the exact synthetic owners. Evidence: .test-tmp/onboarding-dev/onboarding.mysql-1795122124119.json (ignored). The first failure remains recorded above; no executable changes occurred between runs. Final build results are appended after completion.
- Final backend npm run build and frontend npm run build -- --configuration production both exited 0 on the final executable inputs. Existing unrelated style-budget, CommonJS and 3.21 MB initial-bundle warnings remain. No executable change followed the passing unit/UI/real-model/persistence checks. Full diff reviewed and git diff --check passed; no main integration, remote push or application-server launch.

## 2026-11-19 — Stop per-message profile recaps

Base 04309b39, same feature worktree. The screenshot showed the responder reciting
registration/activity/employment again after a one-word workplace answer. Existing
instructions said not to summarize repeatedly, but the model received the entire
updated profile without a separately identified new-message delta.

Acceptance: ordinary continuation acknowledges at most the new detail and asks
one useful follow-up, with no restatement of prior unrelated profile facts;
explicit recall and the end summary still work. The service now supplies newFacts
separately from currentFacts/background. The response contract explicitly scopes
ordinary acknowledgements to that delta, with positive/negative continuation
examples. Full context remains available for relevance and recall. No change to
UI, extraction, storage, deletion, scope, API shape or DB schema.

- node backend/scripts/onboarding-conversation-smoke.cjs --run-paid-recap-smoke:
  exit 0, three targeted cases passed through the real propose service with mock
  writes. Home reply: הבנתי, אתה עובד מהבית. האם אתה משתמש ברכב לצורכי העסק?
  No-employees reply: הבנתי שאין לך עובדים. האם יש שותפים בעסק?
  Explicit recall still included the known name/business information. 12,988
  input tokens, 297 output tokens. No broader paid suite was repeated.
- Focused service tests verify that newFacts includes only the workplace answer
  while old name data remains available in currentFacts; the existing new-answer
  context regression also checks the delta. Final test/build results follow.
- Frontend checks, MySQL and HTTP persistence checks were not repeated because
  their inputs/behavior are unchanged. No app server, live-user action, main
  integration or remote push. Existing deletion verification remains separate.
- Final backend npm test -- --runInBand --runTestsByPath src/agent-onboarding/onboarding.service.spec.ts src/agent-onboarding/onboarding.extractor.spec.ts: exit 0, 35 passed, 0 skipped (31.3 seconds). Backend npm run build: exit 0. Tests, bounded model checks and build cover final executable inputs; only documentation changed afterward. Complete diff reviewed; git diff --check passed.
