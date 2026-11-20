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


## 2026-11-19 — Bind short answers to the actual question; inspect tracing

Base 947cb11c, same feature worktree. User's car → no → no transcript showed an
employees answer being treated as employment/deletion context. Code inspection
found no persisted identity for the model's last question and question:null on
ordinary requests, leaving the model to infer the meaning of a bare no from the
whole mixed history. The evidence is the supplied transcript and code inspection,
not a retrieved trace. Langfuse exists only in backend/agent's separate main-agent
runtime; Nest onboarding uses raw fetch without that integration. No claim that
the main-agent exporter is currently healthy, and no new tracing enabled here.

Acceptance: the actual question identity survives commit/read; no about employees
updates only employees and advances to partners, second no updates only partners;
old salary/deletion context remains unchanged. Without a bound boolean question,
ask for clarification rather than invent a fact. Preserve free narrative and
explicit recall. No frontend/server startup or main/push changes.

Implemented a structured nextField response, checked against missing basics. The
server renders the canonical question and stores askedField in proposal JSON.
Read joins the owner/business-scoped proposal for this marker. Short yes/no uses
the verified pending question and fixed field scope, bypassing model inference.
Long answers receive the actual last question plus answerField. Exact older
canonical questions can be recovered; mismatched metadata or unbound short
answers cannot alter employment. No schema/accounting change. This does not
automatically repair earlier ambiguous facts in a real user's profile.

Verification:
- Backend npm test -- --runInBand --runTestsByPath src/agent-onboarding/onboarding.service.spec.ts src/agent-onboarding/onboarding.domain.spec.ts src/agent-onboarding/onboarding.extractor.spec.ts: final exit 0, 54 passed, 0 skipped, 17.3 seconds. Tests cover exclusive employees/partners targeting with stale employment history, no model calls for short answers, unbound-answer clarification and consistency of displayed question/field.
- Initial approved MySQL suite executed 14 passing tests including the new persisted target test, but teardown failed because a new synthetic suffix short was outside the existing allowlist. Fixed the fixture to use already-allowed live; safeguards were not relaxed. Verified that the exact orphan cohort fell within that test report's UTC creation window, cleaned those four exact synthetic owners and verified zero remaining profile/proposal/change rows. The first manual cleanup connection used the TypeORM username option with mysql2 and was rejected before queries; corrected the adapter to mysql2 user. No real-user data was read/deleted.
- The next broad MySQL run passed the new persisted-target case but had two unrelated 5-second timeouts (simultaneous confirmation and all-memory deletion), 12 passed/2 timed out; no assertions or timeouts were relaxed. Added --short-answers-only to the existing guarded runner to isolate the affected test; final focused result follows. Broad run evidence remains .test-tmp/onboarding-dev/onboarding.mysql-1795123783929.json (ignored), not a claimed full passing run.
- The bounded car/no/no model diagnostic uses synthetic context including old corrected salary/deletion history. The car turn uses the real model; the two no turns update their bound fields without model calls. First diagnostic passed all three cases, then the acknowledgement prompt was aligned with the structured question contract and the same targeted cases rerun on final inputs. Final result follows.
- No frontend checks or HTTP app server were run: frontend source is unchanged. No production access, real-user mutation, local main integration or remote push. Local feature commit only after final verification.
- Final focused SQL command node backend/scripts/run-onboarding-dev-tests.cjs --database=keepintax-dev --short-answers-only: exit 0, 1 passed/13 deliberately skipped, exact synthetic cleanup verified zero rows (.test-tmp/onboarding-dev/onboarding.mysql-1795123894957.json). Final bounded model command node backend/scripts/onboarding-conversation-smoke.cjs --run-paid-short-answer-smoke: exit 0, all 3 cases passed; 4,595 input/117 output tokens. The car turn selected employees; subsequent no/no wrote employees/partners respectively, unchanged employment, no model calls for the short answers. Both focused runner scripts passed node --check. These are focused passing checks; the broad-suite timeout failures above are not reported as passing.
- Final backend npm run build: exit 0. Complete diff reviewed and git diff --check passed. Final unit tests, model diagnostic, focused persistence regression and build share the same executable inputs; only documentation changed afterward. No frontend source change, app-server launch, main integration or push.


## 2026-11-19 — Local Langfuse tracing for onboarding

Base 551aaec2; same codex/agent-onboarding worktree. Explicit scope: connect
onboarding to the existing local Langfuse, all stage inputs/outputs, no app/server
startup, main integration or push. Acceptance: linked request/child observations
for model and deterministic routes, raw model requests/responses plus usage,
validation/routing/final answer/persistence/summary/deletion visibility; local-only
destination, privacy masking and no chat failure when tracing fails.

Inspected backend/agent's existing local-only policy and official Langfuse OTLP
mapping. Existing local health endpoint returned 200, version 4.76.0, and the
existing stack keys authenticated to project keepintax-agent-dev. The feature and
primary backend environments had no Langfuse settings. Added only six missing
local tracing variables to the feature's existing ignored backend/.env from the
existing local project configuration. No credentials printed, committed or newly
generated; no other environment setting overwritten. git check-ignore confirmed
backend/.env remains ignored. No Docker or application process was started.

Implemented isolated AsyncLocalStorage context and OTLP/HTTP JSON export, without
a shared global provider or new dependency. Public service operations and nested
reads share one request trace; generation stages retain exact body/raw response,
schema, finish reason and usage. Fact validation and accepted facts, question
routing, final response/askedField, proposal creation, transaction, deletion scope
and summary are recorded. User/session/proposal metadata correlates requests.
Export happens outside the database transaction after root completion, uses
loopback only with redirect rejection, bounded queue/timeouts and safe warnings.
An unsampled parent suppresses its children. Phones/emails/credentials are masked;
ordinary content remains useful for debugging. Trace storage is explicitly
separate from agent memory/forgetting and is not read back into conversation.

Verification and known limits:
- Initial unit batch had one fixture failure because the tracing service test did
  not enable AGENT_ONBOARDING_ENABLED; corrected the fixture instead of changing
  the feature gate. Next batch passed 67/67. Added safe serialization coverage
  afterward; final focused test/build results follow below.
- node backend/scripts/onboarding-tracing-smoke.cjs: final exit 0 against existing
  http://localhost:3100. Four synthetic requests produced 12 + 3 + 7 + 5 = 27
  observations. Verified every expected name with non-null input/output via the
  local v4 observations API, parent IDs, common user/session IDs and GENERATION
  types. The short-answer trace has no model observations. OpenAI and DB writes
  mocked; no paid model request, real-user data or live DB mutation.
- Final diagnostic traces: normal 2d2b9d1160b53ae85cc7ac669ccb4f8b;
  commit retry 1e7fd07d23e4d2716c2905843836ea57;
  short answer 6235e4510f917c4b7d14d82d88084b6e;
  summary 8e89374db55912e2f2c13b9e99eeec8f. All in local project
  keepintax-agent-dev. Ignored evidence: .test-tmp/onboarding-tracing/last-smoke.json.
- The synthetic commit diagnostic exercises the already-applied retry branch;
  actual SQL semantics/authorization are unchanged and existing service tests
  cover normal commit/rollback. No MySQL/HTTP persistence or frontend suite was
  rerun for this observational change. No claim that a real authenticated user
  flow was run. Existing broad-suite timeout evidence remains separately recorded.
- Sources: https://langfuse.com/integrations/native/opentelemetry and
  https://langfuse.com/integrations/native/opentelemetry/migration-to-v4. The
  current supported OTLP endpoint was used instead of legacy trace ingestion.
- Final backend npm test -- --runInBand --runTestsByPath src/agent-onboarding/onboarding.tracing.spec.ts src/agent-onboarding/onboarding.service.spec.ts src/agent-onboarding/onboarding.domain.spec.ts src/agent-onboarding/onboarding.extractor.spec.ts: exit 0, 68 passed, 0 skipped (49.8 seconds). Final npm run build: exit 0. Final local four-request smoke passed against the same executable inputs, with 27 observations read back; only documentation changed afterward. Complete semantic diff and new exporter/tests/smoke reviewed; git diff --check passed. Existing running backend processes were not restarted; ignored env additions are read on their next reload/start.


### 2026-11-20 — unify onboarding with the main agent

Acceptance: one createAppAgent/tool loop and template conversation protocol;
interface-specific onboarding policy; shared owner-scoped profile tools and temporal
store; no custom model stages/exporter; preserve free chat, recall, deletion and
end-only narrative summary. Same worktree/branch; no application server start,
main integration or push. No schema change.

Implementation: deterministic `prepareChanges` + existing atomic commit behind typed
profile port; current-message evidence, template call idempotency, marker-bound
business/mode, mode-restricted tool offering AND approval. All interfaces read/write
canonical profile facts. Legacy preference memory remains; generic business-fact
writes are refused. Angular onboarding uses the shared AI SDK transport/resume path.
Removed standalone extractor, responder, summarizer, custom Langfuse exporter and
obsolete HTTP pipeline tests/scripts. Existing historical sources stay readable.

Diagnostic findings corrected: missing deletion audit text after removing the
responder; section replacement matching an inline tag; optional runtime context
validation breaking ordinary classification flows; tool-budget excess resolved
by deferring profile mutations in ordinary chat, eager in onboarding. Criteria and
20,000-character budgets were preserved. Reviewed intentional prompt/tool snapshot
diffs before updating. Initial broad unit run also hit the existing Git fixture's
5-second timeout under concurrent checks; targeted verification follows below.

Storage obstacle: C: filled during ts-jest cache writing. Deleted only the resolved
Angular cache in this feature worktree (3,688,687,535 bytes), then continued checks.
No user files or dependencies removed.

Evidence before final checkpoint:
- Nest focused domain/store: 23 passed.
- Guarded keepintax-dev direct-store suite: 14 passed; cleanup confirmed zero rows
  for exact synthetic owners. Local report `.test-tmp/onboarding-dev/onboarding.mysql-1795137782617.json`.
- Angular onboarding/shared-chat ChromeHeadless: 28 passed (no application dev server).
- Agent focused contract/snapshot tests: 18 passed; subsequent affected
  classification/harness-budget/snapshot tests: 29 passed.
- Real-model six-turn diagnostic was rejected by automatic approval review because
  prompts/tool schemas/synthetic input would be sent to OpenAI. No call executed.
  Asked user for this specific export/API-cost approval; independent checks continue.
  Do not represent mocked model tests as a real-model conversation-quality eval.


Final checkpoint (base revision 74f5661b, implementation in this local feature commit):
- backend/agent `npm run check`: passed, including formatting, lint and semantic
  budgets. `npm run typecheck`: passed; non-blocking Effect suggestions remain.
- backend/agent `npm test`: 68 files passed, 3 skipped; 372 tests passed, 22 skipped
  (46.18 s). This full batch preceded the last profile-deletion receipt check and
  onboarding-only voice adaptation. On those final changes, the affected
  `agent-answer-check.test.ts` + `agent-profile.test.ts` batch passed 28 tests,
  and the `agent-profile.test.ts` + `agent-harness-override.test.ts` batch passed
  9 tests. These are mixed-revision evidence, not a claimed second full final run.
  The earlier Git fixture timeout did not recur in the successful full batch.
- backend/agent `npm run build`: passed after the final prompt adaptation;
  agent-http.mjs and task-worker.mjs rebuilt, no worker/server started.
- backend `npm test -- --runInBand --runTestsByPath
  src/agent-onboarding/onboarding.service.spec.ts
  src/agent-onboarding/onboarding.domain.spec.ts`: final 23 passed (40.209 s).
  backend `npm run build`: passed afterward.
- frontend `npm test -- --watch=false --browsers=ChromeHeadless
  --include=src/app/pages/agent-onboarding/*.spec.ts
  --include=src/app/pages/dev-agent/dev-agent-chat.spec.ts
  --ts-config=tsconfig.onboarding-spec.json`: 28 passed. Final production build
  after removing the old proposal retry button and matching the template's
  5,000-character input limit passed. Existing module style-size/CommonJS and
  initial-bundle warnings remain; no new budget/threshold exception introduced.
- Profile persistence remains the previously passing final-store batch of
  14 synthetic keepintax-dev tests with cleanup. Later Nest edits only formatted
  code and removed the unused old short-answer helper; no store logic changed.
- `git diff --check`: passed. Reviewed runtime integration, owner/business gates,
  memory tool contracts, temporal transaction behavior, shared frontend transport
  and intentional snapshots. No schema mutation needed for this migration.
- Added the shared answer check's support for profile deletion receipts: an
  ordinary successful profile update cannot justify claiming a deletion.
- No manual authenticated browser flow or paid model eval was executed. User's
  specific OpenAI diagnostic approval remains pending following auto-review
  rejection; the helper is an ignored local artifact, not a shipped second engine.
- No main integration, push, dev server start, environment/port change or real-user
  data mutation. Existing 4204/3004 configuration is preserved.


### Approved real-model diagnostic after 89cf792e

The user explicitly approved the previously rejected OpenAI diagnostic. Ran six
synthetic turns through createAppAgent with the existing model, profile tools,
schemas and template Langfuse integration. The profile port used an in-memory
fixture, not real-user/DB data; MySQL transaction coverage remains the separate
passing 14-case dev-store batch. This is not a claimed authenticated UI/DB E2E run.

Passed the intended regression: mixed personal/business car use; no employees;
no partners; recall; delete employment information without asserting its opposite;
finish with a natural story excluding the deleted employment information. The
existing employment=yes remained intact across both short no answers. Live output
and state evidence: `.test-tmp/onboarding-runtime/last-smoke.json`.
Session: onboarding-runtime-99b10f70-65bd-4591-a74a-e5026f0f8194.
Input tokens 86,788; output tokens 958 (SDK total usage, not a cash-price estimate).

Reviewing the actual traces exposed a tool-contract problem, not an answer-field
mix-up: irrelevant forgetIds was required for ordinary adds. The template's generic
repair then removed nullable fields, leading to a second validation attempt. Made
inapplicable replacement/date/workplace/history fields optional at the tool boundary
and normalized them to canonical null/[] before calling the unchanged store validator.
Missing replacement still fails a transition; missing dates still fail registration/workplace transitions under existing persistence rules;
missing forgetIds still fails a targeted deletion. No validation threshold weakened.
Added a regression through the real AI SDK schema adapter and execution contract.

Reran only the two affected OpenAI turns after the consolidated correction:
`.test-tmp/onboarding-runtime/contract-recheck.json`. Both passed with exactly
readUserProfile + updateUserProfile, one successful update each, no repaired call.
Session: onboarding-runtime-178968d8-047a-4adb-9bf5-7d88016e4974.
Input tokens 28,219; output tokens 259. No other paid-model repeats.

Tracing verification: read synthetic-session observations back from the existing
local Langfuse v4 via `/api/public/v2/observations`, with strict session/trace filters
and credential-free output. Legacy `/api/public/traces` correctly returns 404 in v4;
used the supported API after consulting the official migration docs:
https://langfuse.com/faq/all/deprecated-api-migration .

The first diagnostic mistakenly created a second ManagedRuntime while agentTelemetry
also initialized appRuntime. Its final wrapper root was not flushed by the isolated
runtime; model/tool IO was present for all six turns (18 generations, 10 executed
tools). This was a diagnostic harness issue; no production tracing change was made.
A root-only probe and then a mock-model/profile-tool probe through the sole appRuntime
confirmed complete ancestry/input/output. The corrected two-turn REAL-model recheck
also uses appRuntime: both parent answer-chat-message roots, agent observations,
all six generations and four tools have input/output; zero missing wrapper roots.
Final trace IDs: 3d254ac89a978ca0e0dcde8ed4e0ed5d and
f394675bc0ecab203a77ac129865bec5. Local evidence:
`.test-tmp/onboarding-runtime/contract-trace-verification.json`.

Focused final diagnostic checks:
- Profile regression suite: 6 passed.
- Profile + prompt snapshot + harness override + harness tree: 34 passed and one
  expected tool-schema snapshot failure. Reviewed the required-list-only diff;
  updated only the intentional schema snapshot. Subsequent snapshot suite: 9 passed.
- `npm run typecheck`: exit 0, existing non-blocking Effect suggestions only.
- Final `npm run check`, build and Git status are recorded below.
- No dev servers, merge, push or real-user mutation. Existing ports unchanged.

Final diagnostic revision: npm run check passed; npm run build passed (475.5 kB agent-http.mjs). git diff --check passed. The focused optional-field correction is the only executable change after the approved live run; the two affected real-model turns ran on that correction. Other executable inputs retain prior passing evidence. Diagnostic command from backend/agent: npx tsx --env-file=../.env .test-tmp/onboarding-runtime-smoke.ts (six-turn version first; bounded two-turn version for recheck). Local-only helpers and full synthetic evidence retained under root .test-tmp/onboarding-runtime.
