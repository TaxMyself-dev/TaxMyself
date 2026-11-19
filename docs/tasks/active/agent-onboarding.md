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
