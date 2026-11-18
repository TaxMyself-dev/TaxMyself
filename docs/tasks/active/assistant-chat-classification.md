# Assistant Phase A transaction classification

- Status: WORKER_COMPLETE — narrow orchestration fix verified; awaiting user review, no main integration or push
- Task manager and worker: Codex, same agent; no delegation
- Worktree: existing TaxMyself-new-ai-assistant feature worktree
- Branch: new-ai-assistant
- Base: 366f2748c32f57bc3afc7fa20d9793f4f53e6f49
- User approval: 2026-11-17 implementation/tests/docs; 2026-11-18 permanent default and one-time checkbox. No main integration or push.

## Business outcome

Chat can find a pending outgoing bank/card transaction, propose an existing
effective category and apply classification after the user's card approval.
Permanent merchant/account rule is the default; a checkbox selects one-time. It
uses catalog defaults and never approves an expense or changes confirmed rows.

## Acceptance criteria

- [x] Resolve the business and transaction; ambiguous matches ask.
- [x] Use effective catalog IDs and accounting defaults, not model percentages.
- [x] Display the original proposal and require its approval before writing.
- [x] Recheck current identity, delegation write scope, module and business.
- [x] Check source state/catalog under row locks; preserve period locks.
- [x] Denial, forged/stale proposals and closed approvals change nothing.
- [x] Same-state replay writes nothing; a changed payment cannot acknowledge an old amount.
- [x] Verify focused tests, builds, four model scenarios and live approval after reload.
- [x] Update documentation and preserve unrelated existing files.

## Implementation and boundaries

Two books tools: prepareTransactionClassification and approval-only
classifyTransaction. The successful assistant tool result stores the original
signed, expiring proposal and its display. The model passes only a short ID;
execution and the frontend independently resolve the original preparation.
Only a successful assistant result in this owned conversation is accepted.
The client may send an approval decision and its strict classification mode token,
never replacement business/transaction/category input.

AgentClassificationService rechecks access, OPEN_BANKING and current ACTIVE
delegation EXPENSES_APPROVE scope. An owner represented by an accountant retains
the existing classification-only behavior. The source is owned, outgoing,
account-linked, pending and unlocked; the target is an effective existing
mapped/private subcategory. Percentages/recognition/equipment come from its card.

TransactionProcessingService.classifyPendingForAgent locks owner/cache/slim in
one DataSource transaction, performs preflight and runs classifyManually (one-time)
or classifyWithRule (permanent) on scoped repositories with classificationOnly=true.
No expense/journal path is called. Agent rule backfill is business-scoped and skips
confirmed/locked rows and other one-time classifications.

Proposals expire after 30 minutes. Signing is process-local: restart/deployment
or another backend instance invalidates an outstanding proposal safely. A new
card is then required. Shared/persistent signing for multi-instance rollout is
not part of this local feature delivery.

No arbitrary batches, confirmed-row edits, expense approval, document
actions, profile, learning or monitors. No schema, production, provider or
environment-file changes. The main/push approval gates remain binding.

## Automated verification

All commands below ran in this worktree's own package/dependencies. These are
checkpoint results plus affected final reruns, not a claim of a complete broad
suite on the final commit. Final changes after the model runs were the backend
payment-source replay check, unavailable-port fallback cleanup, missing-card/UI
field safeguards and documentation; their affected automated checks were run.

| Package | Exact command | Result |
| --- | --- | --- |
| backend | npx jest src/agent-harness --runInBand | 6 suites, 97/97 passed at checkpoint |
| backend | npx jest src/transactions/agent-classification-transaction.spec.ts src/transactions/transaction-classification-permissions.spec.ts src/transactions/classification-upsert-columns.spec.ts --runInBand | 3 suites, 9/9 passed |
| backend | npx jest src/agent-harness/agent-classification.service.spec.ts src/transactions/agent-classification-transaction.spec.ts --runInBand | Final affected rerun: 2 suites, 15/15 passed, including changed-payment replay |
| backend | npx eslint --fix src/agent-harness/agent-classification.service.ts src/agent-harness/agent-classification.service.spec.ts src/transactions/agent-classification-transaction.spec.ts | Exit 0; scoped to new files |
| backend | npx nest build | Final build exit 0 |
| backend/agent | npm run check | Final exit 0, 338 files |
| backend/agent | npm run typecheck -- --pretty false | Final exit 0; existing Effect suggestions only |
| backend/agent | npm run build | Final exit 0 |
| backend/agent | npx vitest run --project unit tests/src/agent/core/tool-runtime tests/src/agent/tools/books tests/src/agent/chat/turn/agent-chat-approvals.test.ts | Final affected run: 13 files, 84/84 passed |
| backend/agent | npm test | Broad checkpoint: 345 passed, 3 failed, 22 skipped; see below |
| backend/agent | npx vitest run --project unit tests/evals/runner/eval-run-git-state.test.ts tests/src/agent/core/agent/agent-prompt-snapshots.test.ts | Affected rerun: 2 files, 10/10 passed after snapshot review/update |
| frontend | npx ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.agent-chat.spec.json --include=src/app/pages/dev-agent/classification-card.spec.ts --include=src/app/pages/dev-agent/dev-agent-chat.spec.ts | Final 10/10 passed in ChromeHeadless |
| frontend | npx ng build | Final exit 0; existing bundle/style/CommonJS warnings |

The broad agent run failed two intentional prompt/tool snapshots and the
unchanged Git-fingerprint test's 5-second timeout during concurrent builds.
Reviewed the failed snapshot diffs before updating only the two changed files;
the instructions add the supported capability and tool namespace, while tools.json
adds exactly the two schemas. Both snapshot tests and the unchanged timeout test
then passed in the affected rerun. No timeout/threshold was relaxed.

The ordinary frontend Karma command with --include alone compiled unrelated
legacy specs and incompatible library declarations, so no tests ran. Added a
reusable isolated tsconfig using the app's existing skipLibCheck policy and only
the chat/card specs. No existing tests were removed. A test-only excess-property
error in the new spec was corrected before its final passing run.

No disposable MySQL instance was available, so a real rollback/concurrency
integration suite was not run. Unit tests verify the transaction/lock boundary,
scoped repositories, stale/permission failures and replay; the real successful
write was independently verified in keepintax-dev below.

## Bounded model verification

Each executed case used one repetition, fixed domain ports and deterministic
behavior checks, without Jev wording judges. The harness does not stream/save
assistant parts, so these fixtures explicitly seed only the successful stored
preparation needed by the resolver. Model requests still execute the actual
read, prepare, approval and decision flow. This approximation is not the live
persistence/reload proof, which is recorded separately below.

1. npm run eval -- --variant phase-a-diag --reps 1 tests/evals/agent/interaction/classification.eval.ts -t "clear request"
   FAILED 0/1, 3 filtered out, two model answer turns. Fingerprint
   8fd0ba955b923dc7. Actual tool inputs showed a truncated nested signed JSON
   string copied by the model. Fixed the contract to resolve a short ID from
   stored results rather than adding repeated prompt instructions. Failed
   results retained. The runner's exit 0 was not treated as a passing case.
2. npm run eval -- --variant phase-a-reference --reps 1 tests/evals/agent/interaction/classification.eval.ts -t "clear request"
   PASSED 1/1, 3 filtered out, two model answer turns. Fingerprint
   8f6784e3b6938287. No write before the card; approval executes exact proposal.
3. npm run eval -- --variant phase-a-remaining --reps 1 tests/evals/agent/interaction/classification.eval.ts -t "denial|ambiguous|continues"
   PASSED 3/3, 1 filtered out, five model answer turns. Fingerprint
   1aeb44660285e503. Denial writes nothing; ambiguity asks before preparing;
   a transaction-list follow-up reaches the classification card.

Totals: four successful planned cases, seven successful answer turns; including
the failed diagnostic, five evaluated cases and nine model answer turns. The
runner enumerated 99 dataset slots while collecting metadata; only the filtered
cases above were executed. No broad paid batch or repeated wording tuning.

## Live browser and database proof

Own servers on backend 3002/frontend 4202. Existing 3000/4200/4201 processes
were untouched. Verified DISABLE_SYNCHRONIZE=true, SKIP_BOOT_SEED=true and
DB_DATABASE=keepintax-dev before starting; runtime log confirms synchronize=false.
The exact test origins were allowed through AGENT_APP_ORIGINS in process
environment only. No .env changes, schema SQL, demo reset or seeding.

Demo account: demo+assistant-qa@keepintax.local, business 999100012. Conversation
db1e1881-c804-4a4a-925f-f9eb2631c894. Target demo-assistant-qa-31, 2026-11-11,
59 ILS outgoing. Verified an initial denial leaves it unclassified. A later
explicit classification request produced a fresh card for עסק / תוכנות with
100% VAT and tax defaults, recognized=true, equipment=false, depreciation=0.
After reload, one history read hit Query inactivity timeout; reopening the same
conversation once recovered the stored card with the identical proposal ID and
enabled approval. Approval returned output-available and the UI explicitly said
classification only, no expense approval and no rule.

Read-only SQL snapshots before/after independently confirmed:

| Field | Before | After |
| --- | --- | --- |
| Category / subcategory | null / null | עסק / תוכנות (subcategory ID 40) |
| Classification type | null | ONE_TIME |
| confirmed / isLocked | 0 / 0 | 0 / 0 |
| Expenses | 23 | 23 |
| Journal entries | 27 | 27 |
| Standing rules | 0 | 0 |

The test classification remains in the demo; it was not reset. Original demo
questions about an unclassified 59 ILS payment must account for this change.
Local evidence files are outside Git in the chat deliverables folder:
phase-a-demo-before.json, phase-a-demo-after.json, phase-a-final-nest-build.log,
phase-a-final-frontend-build.log and own server logs. An empty conversation
reload also exposed the pre-existing empty-message validation failure; it was
not included in this feature's scope.

## Handoff and integration

Result: implemented and verified locally. The feature commit containing this
record is the delivery revision; see Git history for its hash. No local main
integration, push or deployment. Preserved pre-existing untracked files:
backend/journey-timings.local and the three ai-agent-conversation / interaction
proposal documents recorded at task start. No secrets/dependencies/build output
or local evidence are included in the feature commit.

Documentation updated: central tools plan, agent GUIDE, agent/edge/transaction
topic instructions and demo operation note. Security impact is a new scoped
approval boundary; accounting logic is reused unchanged. Multi-instance signing
and disposable-database concurrency testing remain rollout limitations.

## Langfuse verification rerun on 2026-11-17

User requested checking the Docker/Langfuse stack, rerunning exactly Phase A's
evals and verifying actual trace ingestion, with no merge or push. No executable
source, prompts, tests, environment files or thresholds changed in this follow-up.

### Environment and exact command

- Tested revision: 9ed04612c5c430eb2fff49ead3b2f2544b1bafe4, tracked source clean.
  The same four pre-existing untracked files were preserved.
- Existing launcher: .\start-ai.cmd --check -> Docker READY, Langfuse :3100 READY.
  docker ps confirmed the web/worker and healthy Postgres/ClickHouse/Redis/Minio.
- Local health API: HTTP 200, Langfuse 4.76.0. Authenticated projects API:
  HTTP 200, project keepintax-agent-dev in the local KeepInTax organization.
- This v4 events_only deployment returns 404 for legacy /api/public/traces.
  Used the instance's own /api/openapi.yaml and supported
  /api/public/v2/observations API instead. Credentials stayed in environment
  memory and were never printed. SDK 6 already exports through OTLP; no
  dependency upgrade, configuration-file edit or container restart was needed.
- Process-only overrides: LANGFUSE_SAMPLE_RATE=1, LANGFUSE_ALLOW_REMOTE=false,
  OTEL_SDK_DISABLED=true. The latter disables the separate Effect/Grafana
  pipeline; local Langfuse's explicit OTEL provider still ingested successfully.
- From backend/agent:

      npm run eval -- --variant phase-a-langfuse-20261117 --reps 1 tests/evals/agent/interaction/classification.eval.ts

- Run fingerprint: 168dd09ab8d55327; dataset 4a41d3927b03a8f7.
- Manifest creation/model phase: 2026-11-17T21:17:16.584Z (23:17 Israel).
  Runner metadata collection took about three minutes before the model phase;
  its 99 enumerated dataset slots do not mean 99 paid cases ran.
- Four cases, one repetition each, seven model answer turns. Model gpt-6-luna;
  no reruns or wording judges. File duration 62.315 seconds, Vitest 73.30 seconds.
  Inspection through verified ingestion took about eight minutes total.

### Results and unresolved finding

| Case | Result | Model answer turns |
| --- | --- | --- |
| Clear classification request, then approval | PASS | 2 |
| Denial executes nothing | PASS | 2 |
| Ambiguous transaction asks before preparing | PASS | 1 |
| Continue a transaction listing with classification | FAIL | 2 |

The failed case read transactions and categories and called
prepareTransactionClassification, but never called classifyTransaction.
Consequently approvals was empty. Its final text nevertheless told the user
to approve in the card, even though no card existed. This is a real behavior
gap, not an exporter failure or a wording-judge disagreement. The test failure
and trace are retained; no assertion was weakened and no second attempt was
launched to obtain a pass. The runner exited 0 while the recorded result was
3 passed / 1 failed; that exit code is not reported as an all-pass run.

Open acceptance gap: a typed classification continuation must reach the
approval tool, and must not claim a card is displayed when it only prepared a
proposal. This verification request did not include implementing that fix.
Earlier passing results remain historical evidence, not proof that this rerun
passed all four cases.

### Verified ingestion rather than an exporter assumption

Before execution the unique run tag had zero observations. After the final
flush, authenticated API reads found exactly seven trace IDs covering all four
case sessions and all seven model answer turns, with 73 observations tagged
phase-a-langfuse-20261117 in environment eval. Both the root and child observation
queries were checked, including gpt-6-luna generations and queryTransactions,
listCategories, prepareTransactionClassification and classifyTransaction spans.
Root input/output presence was inspected without printing their full contents.
Zero ERROR-level observations were reported; this is telemetry status, not a
replacement for the failed behavioral assertion above.

| Case | Ingested trace IDs |
| --- | --- |
| Clear request / approval | 52eb0b383c40e0c8c6f98b50edbe5a2e; 1292075d91d823551a319332205c2f57 |
| Denial | 8d73d2ffaff7a5490e44a859632b3585; 5d1c2f3b5cdc82f31667a02fbb3c37e3 |
| Ambiguity | 5ed7bafadcd2130a8d911c1f60fc0463 |
| Continuation (failed) | 6d146bac05109a185b253a669119a19e; c7fa45f38087b49e5eb36633b7bb2ed3 |

Evidence: backend/agent/.eval/agent/runs/phase-a-langfuse-20261117 contains
manifest.json, results.jsonl, attempts.jsonl and summary.json; the runner also
updated its local .eval/agent/report/index.html. The chat's local deliverables
folder contains phase-a-langfuse-preflight.json and
phase-a-langfuse-trace-proof.json with sanitized authenticated API evidence.
These generated artifacts and credentials are not committed.

Only this task record is changed by the follow-up documentation commit.
No app servers were started/stopped; no shared application database, demo data,
schema, main branch, remote branch or production service was changed. No merge,
push, deployment, broad test suite or extra paid repetition was performed.

## Narrow orchestration fix and verification — 2026-11-17

The user authorized fixing the continuation/card gap, regression tests, bounded
evals and actual Langfuse ingestion verification, without a general framework,
main integration or push. Continued the existing branch from 80dfa646; executable
base was 9ed04612c5c430eb2fff49ead3b2f2544b1bafe4. No delegation.

### Behavior and regression coverage

A successful current-answer preparation now requires a subsequent model step
with only classifyTransaction available. The prepared ID is supplied in system
context. The SDK creates the real approval request, and execution still requires
the original approval boundary and backend checks. Explicit proposal-only
requests use requestApproval=false. New steers invalidate earlier preparation
eligibility; the boundary resets for a new generation on the same agent. Failed
preparations, read-only follow-ups and attempted IDs do not force another card.
Only classifyTransaction moved out of the deferred books namespace: a forced
single-tool step cannot rely on deferred tool_search. No broad framework.

Ten deterministic tests cover the missing transition, real SDK approval event
with zero writes, preview, cancellation, agent reuse, malformed output, follow-up
origin, attempted IDs, fresh proposals and latest-preview precedence. Added one
model eval for explicit proposal-only behavior; existing assertions unchanged.
Snapshot changes were reviewed before updating: the optional input and removal
of classifier namespace/deferLoading metadata and deferred-list entry only.

### Bounded model diagnostics and final result

All commands ran from backend/agent with LANGFUSE_SAMPLE_RATE=1,
LANGFUSE_ALLOW_REMOTE=false and OTEL_SDK_DISABLED=true, process-only. No judge
criteria, thresholds, credentials or environment files were changed.

1. npm run eval -- --variant phase-a-orchestration-diag-20261117 --reps 1 tests/evals/agent/interaction/classification.eval.ts -t "continues"
   Fingerprint fe2bb3f63acb9e0a. Failed API contract: named tool choice did not
   resolve the namespaced classifier. Not a passing/graded behavioral run.
2. npm run eval -- --variant phase-a-orchestration-final-20261117 --reps 1 tests/evals/agent/interaction/classification.eval.ts
   Fingerprint a9a964818914ab11. Preview and ambiguity passed; three approval
   paths hit API error: deferred tools require tool_search. This prompted the
   narrow eager-classifier change, not another prompt-only retry.
3. npm run eval -- --variant phase-a-orchestration-eager-20261117 --reps 1 tests/evals/agent/interaction/classification.eval.ts
   Fingerprint 42391cfc7ef76485. FINAL: 5/5 passed, one repetition each,
   eight answer turns, gpt-6-luna. Clear request/approval, denial, ambiguity,
   continuation and proposal-only all passed. Vitest duration 69.45 seconds;
   model-turn latency p50 11.415s / p95 14.177s. The runner enumerated 100 slots,
   but only these five selected cases ran; 95 filtered slots are not failures.
   No extra repetitions or judge-noise retries. This is bounded evidence, not
   a production reliability estimate. Existing eval fixture uses a seeded
   stored preparation because its harness does not stream-persist tool parts.

The previously recorded open continuation/card gap is resolved by the final
run and deterministic reproduction. Earlier failed evidence remains above.

### Actual local Langfuse ingestion

Docker/Langfuse were initially down. Ran the existing .\start-ai.cmd launcher;
local Langfuse 4.76.0 health returned 200 at localhost:3100. Used authenticated
/api/public/v2/observations (legacy traces API is unavailable on this v4 setup),
filtered by the unique run tag rather than timestamps: fixture clocks are pinned.
Verified final ingestion at 2026-11-17T21:54:52.725Z: 8 traces, 85 observations,
22 generations with gpt-6-luna input/output, 21 tool observations, zero ERROR
observations. All eight root inputs/outputs present; all five case sessions
represented. Telemetry success is separate from the behavioral assertions.

| Case | Trace IDs |
| --- | --- |
| Clear / approval | e587848c26b5d5b748ad4517bf4775a2; 11ace9ce95f945d277041be6040fadcd |
| Denial | 697ead2463205506fd75bfeee89296ed; 95f92064f5451b44737bf42732e1129c |
| Continuation | 9f8ae19f3012f1b957b891f0684ccc1f; d59d0aa64789e32b2b7db772aa12738d |
| Ambiguity | 95a4f5c5e9181f2b0a5065fea7244da6 |
| Proposal only | 754760350dcd819ca94c7da3f04282a9 |

Sanitized evidence is in this chat workspace's deliverables folder:
phase-a-orchestration-eager-preflight.json and
phase-a-orchestration-eager-trace-proof.json. Diagnostic variants retain their
own evidence. Raw generated eval results are under backend/agent/.eval/agent/runs
with the variant names above; neither generated evidence nor secrets are committed.

### Final package verification and delivery

On final executable source: npm run check passed (341 files); npm run typecheck
-- --pretty false passed with existing Effect suggestions only; npm run build
passed; npm test -- --maxWorkers=2 passed: 67 files, 358 tests, 22 skipped across
3 files, 69.59 seconds. New flow/helper tests and both reviewed snapshots passed
in this full run. The earlier 357-pass checkpoint predates the final registry
change and reuse test; it is not substituted for this final run. A verification
session's output was lost during context compaction, so final checks were run
once more with retained output; no extra paid eval was needed.

git diff --check passed. Changed runtime/tests were reviewed directly; documented
repository links resolve. No executable changes followed the passing checks.
Local feature commit contains the implementation, tests, snapshots and docs;
see Git history for its hash. Work lasted about 28 minutes from 21:29 UTC,
including bounded model/API diagnosis, local stack startup and final checks.

No app servers were started or stopped. No application database, demo data,
schema, production, dependencies or environment files changed. Only agent package
runtime/tests and documentation changed, so unrelated Nest/Angular checks were
not rerun. Existing untracked files were preserved. No main integration or push.

## Cache/slim consistency root-cause fix — 2026-11-18

User authorized tracing and fixing the source, tests and clearer block messages;
no main integration or push. Continued new-ai-assistant from 3c54e4b7, preserving
the same four pre-existing untracked files. No delegation.

Acceptance: approving a payment updates slim and its display confirmation in the
same transaction; fixture creation projects all final slim state into cache;
existing local fixture is repaired without changing accounting/source records;
blocked classification reports the actual reason without guessing.

Root causes independently reviewed:
- scripts/seed-assistant-qa.ts creates classified slim rows directly, including
  marking pending/private Expense transfers confirmed, without mirroring cache.
  Pending Expense approval is different from an untransferred bank transaction.
- ReportReviewService.approveMatched and approveTxNoDoc created the Expense and
  confirmed slim through one transaction manager but never confirmed the cache.
  The transactions screen and agent read that cache; production provider refresh
  normally overlays slim later, leaving an incorrect interval before refresh.

Fixes: both real approval paths now update the owned cache confirmation and report
period with the same manager as Expense/slim changes. Cache update errors propagate
and abort the transaction; absent cache is valid for archived transactions. The
fixture-specific helper projects final classification, recognition, equipment,
percentages, reporting, confirmation and lock fields without changing source
amounts/accounts. It is called on initial and completed additive seed runs; seed
verification rejects mismatches. Dedicated repair CLI checks keepintax-dev,
requires --apply, identifies only QA_EMAIL and locks records. No full seed/reset.

Classification eligibility still enforces the same boundaries. The error now
identifies transferred-to-Expense, report lock, absent account link or incoming
payment separately. Agent recovery guidance preserves this reason and explains
that confirmed does not certify the Expense's accounting approval.

Local data repair and proof:
- node -r ts-node/register -r tsconfig-paths/register scripts/repair-assistant-qa-cache.ts --apply
- 25 existing display rows projected, among 32 demo cache rows. Confirmation
  mismatches dropped from 23 to 0. No slim, Expense, journal or rule rows changed:
  full ordered-row SHA256 comparisons for each table were identical before/after.
- Read-only proof used the fixed demo email and a read-only SQL transaction.
  Sanitized artifacts: chat deliverables/cache-consistency-before.json and
  cache-consistency-after.json. No credentials or generated proof committed.

Verification commands (backend unless specified):
- npx jest --runInBand --testPathPattern='report-review|agent-classification.service|assistant-qa-cache'
  10 suites, 70/70 passed. Includes actual approval method calls, both cache-write
  failure paths, fixture projection/idempotence/account isolation, and slim-only
  eligibility blocks with exact messages.
- npm run build: passed on final runtime source.
- npx jest --runInBand --testPathPattern='src/transactions/|reports.review-scope|assistant-qa.profile'
  First checkpoint: 14 suites passed, one failed; 99 passed / 1 failed.
  Reviewed failure: archive test double rejected the newly used cache repository,
  not an accounting behavior failure. Added affected=0 cache support and assertions
  preserving archive approval/period. No assertion removed or threshold weakened.
- npx jest --runInBand src/transactions/pending-transaction-archive.spec.ts
  Final affected rerun: 4/4 passed. Other 96 adjacent tests retained their passing
  evidence; executable inputs unchanged. These are combined checkpoints, not a
  claimed single full-backend run on the final commit.
- backend/agent: npx vitest run --project unit tests/src/agent/core/tool-runtime tests/src/agent/tools/books
  14 files, 92/92 passed; npm run build passed.
- Added tool-error-wrapper regression afterwards; npx vitest run --project unit
  tests/src/agent/core/tool-runtime/agent-tool-error-next-step.test.ts: 8/8 passed.
  Reviewed/fixed its spacing lint; no executable source changed afterwards.
- Agent npm run check: initial documentation formatting and later new-test spacing
  issues were corrected; final result recorded below. Documentation normalization
  was necessary for existing Phase A additions, with no prose removed.
- git diff --check and direct diff review; docs reference existing code/commands.

No paid evals, browser run, full fixture creation, provider/Firebase/Drive call,
schema change, production operation or environment-file edit was needed. Live
HTTP/LLM presentation was not retested. App servers were left running untouched;
the rebuilt bundle and new Nest messages require backend restart to load.
Main and remotes remain untouched. Local feature commit records this delivery.

Final agent check: npm run check passed (341 files); git diff --check passed. Combined backend evidence covers 170 distinct passing tests across the focused and adjacent checkpoints; agent coverage is 92 passing tests plus the added wrapper regression verified in its 8-test file. No failing checks remain for this scope.

## Reclassification capability clarification — 2026-11-18

Following the user's manual test, the model claimed an already-classified payment
could not receive a card. Code inspection showed no category-null eligibility
requirement; the supported contract said pending without distinguishing classified
from transferred-to-Expense. The backend test now explicitly proves prepare/apply
can change an existing unconfirmed classification. No backend eligibility or
approval policy changed. Tool descriptions and the central capability list now
explicitly support both unclassified and classified outgoing transactions before
Expense transfer, with existing locks/access checks and a new approval card.

Continued existing new-ai-assistant from 6d38a19a. Preserved existing untracked
files. No main integration/push, app restart, database write or delegation.

Verification:
- Backend: npx jest --runInBand src/agent-harness/agent-classification.service.spec.ts
  15/15 passed including the new existing-classification test.
- Agent prompt snapshots: first run 7 passed / 2 expected mismatches. Reviewed
  differences in the capability paragraph and two tool descriptions before -u;
  no schema, approval flags or tool availability changed. Updated run 9/9 passed.
- Agent npm run typecheck -- --pretty false initially caught an incorrect field
  name in the new eval assertion before any paid call; corrected toolName to name.
  Final typecheck passed (existing Effect suggestions only), npm run build passed.
- Bounded model eval: npm run eval -- --variant reclassification-20261118 --reps 1 tests/evals/agent/interaction/classification.eval.ts -t reclassifies
  Selects one new case with four answer turns: existing category, denial with zero
  writes, a fresh approval request, then approved exact-proposal execution once.
  Existing fixtures keep historical stored-proposal seeding approximation; this
  is a model orchestration check, not live browser persistence verification.

Final results: agent core/classification unit scope 12 files, 79/79 passed;
npm run check passed. Model eval fingerprint 66ffdccc51857a43, dataset
0f1dc861f7eb31e9: selected case 1/1 passed with four answer turns, five sibling
cases skipped. Runner enumerated 101 metadata slots, only one paid case ran.
No retries or threshold changes. Stored passed_all=true and every code assertion
held. Actual queryTransactions inputs used no unclassified-only filter; results
contained classified rows, preparation ran twice and execution ran only after
new approval. No broad suite is claimed from this bounded diagnostic.

Authenticated local Langfuse v2 observation reads found all four answer traces,
38 observations including ten generations, eight tools, zero ERROR observations.
Trace IDs: 61bfbb8c991117e973e475166d6afb0f,
80db41b73855e0fc9779105feaacfe8b, 36f44873d3c2ee8c565c0d66ef6936d5,
e3b19ee40f31a351dfdcb8668f3838bf. Sanitized evidence in the chat deliverables:
reclassification-20261118-preflight.json and
reclassification-20261118-trace-proof.json. Generated eval artifacts remain
ignored under .eval/agent/runs/reclassification-20261118.

Executable source was unchanged after passing typecheck/build/model/unit checks;
final docs were formatted and git diff --check passed. Local feature commit only.
The running backend must be restarted to load the rebuilt agent bundle. Manual
browser verification remains for the user; no actual demo classification changed.


## Permanent default and one-time checkbox — 2026-11-18

The user explicitly changed the previous one-time-only scope: default behavior
must create/update the same merchant/account rule as manual classification, and
the approval card must offer a one-time checkbox. Continued the existing feature
branch from a3faf8dd. Same original untracked files preserved; no delegation.

Acceptance: unchecked default creates/updates a permanent rule after approval;
explicit one-time request prechecks the box; the user can change the checkbox
before approving; denial writes nothing; the model asks no redundant mode
question; legacy cards cannot gain permanent-rule authorization; catalog,
actor/owner/business/module/write scope, source snapshots, period locks and
no-expense-approval boundaries hold. Rule scope/overrides are disclosed on-card.

Implementation reviewed across tool, server, transaction and UI boundaries:
- New signed proposal version 2 carries mode defaults, account/merchant,
  backfill-from date, existing-rule/one-time override signals and rule snapshot.
- The classifier still accepts only proposalId. Its execution reads the strict
  mode token from the authenticated stored approved decision matching the exact
  proposalId AND toolCallId. Foreign/user parts, other invocations and denials
  cannot select the mode or substitute the signed operation. Existing generic
  approval parsing is unchanged. SDK reason is the transport for this one choice.
- Old signed proposals without version 2 execute one-time and reject expansion;
  legacy card checkbox is checked/disabled. New checkbox is unchecked by default,
  or prechecked for an explicit one-time request. No additional mode question.
- Permanent execution reuses classifyWithRule with explicit approved override,
  classificationOnly=true and the focus business as backfill scope. Rule, slim
  and cache writes share the existing agent transaction. It returns real rule ID
  and backfill count. One-time executes classifyManually and creates no rule.
- Backfill retains merchant/account and one-year effective lower bound and
  excludes confirmed/locked rows and other one-time classifications. The agent
  additionally restricts it to the approved business. Future matching uses the
  existing rule engine, not a new supplier-name matching mechanism.
- Exact unconstrained-rule identity requires SQL IS NULL. TypeORM ignored raw
  null predicates previously, risking selection of a constrained rule; both
  lookup paths now use IsNull. Updated the reviewed cashflow assertion to
  require the operator, retaining tenant/bill/merchant/no-source checks.

Verification:
- Backend focused mode/transaction checks: 25/25 passed; added business/cache
  protection and null-rule identity tests then broadened once.
- Final combined backend: npx jest --runInBand --testPathPattern='src/agent-harness/|src/transactions/'
  19 suites, 183/183 passed, 218.01s. npm run build passed. The only later backend
  change was comment/EOF normalization; executable behavior unchanged.
- Agent npm run typecheck -- --pretty false passed with existing Effect
  suggestions. npm run check passed after new test spacing/boolean lint fixes.
- Prompt/schema snapshots first failed as expected; reviewed capability text,
  tool descriptions and optional isSingleUpdate before -u. No approval flag or
  classifier input-ID boundary changed. A focused run passed 70 tests.
- Full agent: npm test -- --maxWorkers=2: 67 files passed / 3 skipped,
  362 tests passed / 22 skipped, 228.36s. Runtime was then changed only to remove
  stale one-time wording from the dynamic card-step instruction; its two affected
  files and permanent-default model case were selected for final verification
  rather than repeating the full suite. Record those results below.
- Frontend: npx ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.agent-chat.spec.json --include=src/app/pages/dev-agent/classification-card.spec.ts --include=src/app/pages/dev-agent/dev-agent-chat.spec.ts
  Final 13/13 passed, including actual page checkbox/default/approval handlers,
  denial payload and legacy behavior. First checkpoint's optional reason return
  typing error was fixed before the passing run. Chrome shutdown warnings were
  cleanup-only; runner exited 0. Angular production build passed (hash
  64fd52e0ee714835) with existing SCSS/bundle-budget and CommonJS warnings.
- Real MySQL: local standalone guarded script invoked the actual transaction
  boundary/repository classification methods for demo-assistant-qa-30 in
  keepintax-dev. ONE_TIME mode created no rule; RULE mode created a merchant/
  account rule and a RULE slim. Both transactions deliberately threw after
  asserting writes, and rolled back. Full ordered-row hashes for cache, slim,
  rules, Expense and journal tables for this demo were identical before/after.
  Auth/catalog tests are separate: this SQL proof uses minimal read-only service
  fixtures for metadata/period resolution, not a full browser/Nest auth flow.
  Proof: chat deliverables/classification-mode-mysql-rollback.json. No retained
  application data, approvals, rule rows or schema changed.

Bounded model evals:
- npm run eval -- --variant classification-mode-20261118 --reps 1 tests/evals/agent/interaction/classification.eval.ts -t 'clear request|reclassifies'
  Fingerprint 9ec5cd6298c4b9fe: 3/3 passed, 8 answer turns, one repetition;
  4 sibling tests skipped. 102 enumerated metadata slots are not paid cases.
  Permanent default and explicit one-time checked exact prepared mode, no extra
  question, real card, no write before approval and exactly one approved write.
  Reclassification checked denial, a fresh card and later approval. 92.26s model
  file duration; p50 22.81s / p95 35.669s per case. No thresholds weakened.
- Authenticated local Langfuse v2 reads found all 8 traces / 78 observations for
  this tag. Sanitized evidence: classification-mode-20261118-trace-proof.json.
  The eval harness retains its previously documented stored-proposal approximation.
- Final neutral wording rerun: classification-mode-final-20261118, only the
  permanent-default case. This is verification of an actual wording correction,
  not judge-noise repetition. Results pending below.

Final wording verification: fingerprint f123396d00aba7bc, permanent-default
case 1/1 passed with two answer turns (six siblings skipped), 33.51s Vitest,
14.674s case latency. Two affected orchestration files passed 10/10 tests;
agent build/check passed. This targeted evidence supplements, and does not
misrepresent, the earlier 362-pass full suite before the wording-only change.

The final implementation is loaded on the existing local ports: backend 3001
restarted only after verifying its parent is this worktree's ignored launcher;
frontend 4201 hot-reloaded. Backend root returned HTTP 200 and logged
keepintax-dev / synchronize=false. The served frontend lazy chunk returned 200
and contains both mode tokens. No sibling app process was stopped. Old cards
must be prepared again after restart. No live user approval was submitted.

Final local tracing proof, Git diff review/whitespace/link checks and feature
commit complete this delivery. Security impact: one new user-selectable approval
mode for a signed operation, bound to exact persisted invocation; all existing
permission and no-expense-write guards retained. Accounting impact: reuses
existing rule/slim/cache classification logic; no Expense/journal mutations.
No schema change. Existing process-local signing-key rollout limitation remains.

No schema, dependency, production or environment-file change. Existing local
4201/3001 startup configuration remains ignored. Only this worktree's backend
was reloaded on 3001; sibling servers are untouched. Main
integration, remote push and deployment remain unauthorized and unperformed.

Final authenticated Langfuse proof: classification-mode-final-20261118 ingested
2/2 traces and 20 observations, zero ERRORs. Trace IDs:
6618db13f4bc79b70ab01d301053eddc and 2c82cc62a46f2644e02584d1f6575364.
Proof file: chat deliverables/classification-mode-final-20261118-trace-proof.json.
The earlier 3-case run ingested 8 traces / 78 observations / 20 generations with
zero ERRORs. No extra paid repetitions were launched after final success.

## Local ports and mandatory pre-main port gate — 2026-11-18

User requested this worktree on frontend 4201/backend 3001 and a mandatory
pre-integration check for main's frontend 4200/backend 3000. Continued from
6997c0a9. Reused existing ignored local launchers and Angular in-memory file
replacement; the application processes were stopped before this request and
were started only after confirming both target ports were free. No sibling
server was stopped. Backend reports keepintax-dev / synchronize=false.

Added a binding gate in root AGENTS.md and linked it from local development
documentation: inspect effective serve/start settings, backend local PORT,
frontend API URL and environment/process overrides before ANY main integration;
correct failures and record evidence. Worktree overrides stay ignored. Production
PORT/API values remain deployment-controlled. This does not grant merge or push
approval, and no local main integration was attempted.

Verification: frontend/backend HTTP roots returned 200; served frontend main.js
contains API http://localhost:3001/. Tracked frontend source still points to
localhost:3000; backend/.env was inspected for PORT only (3000), not changed.
Feature launchers override these at runtime. git check-ignore confirmed both
launchers and generated environment file are ignored. Root documentation target
and its heading anchor were checked; git diff --check passed. No repository-wide
Markdown-link runner was available. No application source changed, so unit tests,
paid evals and production builds were not rerun for this configuration/docs task.
Original untracked files preserved. Local feature commit only; no merge/push.

## Normal npm startup honors worktree ports — 2026-11-18

User reported normal startup still collided with 4200/3000. Root cause: the prior
ignored helper launchers selected 4201/3001, but frontend npm start remained
ng serve -o and backend/.env still had PORT=3000 and only origin 4200. The previous
runtime-only change did not fix the commands the user actually runs.

Frontend npm start now uses scripts/start-local.js, reading ignored
.local-ai-dev/ports.json and generating only an ignored API environment replacement.
Backend start:watch reads the same ignored port config, overrides even a stale
shell PORT, retains DISABLE_SYNCHRONIZE=true and appends the local chat origins.
Without a local port file the frontend delegates to its original Angular CLI
behavior and tracked API localhost:3000 remains unchanged. No machine-specific
4201/3001 preferences are committed. The existing pre-main 4200/3000 gate holds.

Only this worktree's ignored config sets frontendPort=4201/backendPort=3001.
Its ignored backend/.env now has PORT=3001, matching chat origins and the same
no-schema/no-boot-seed safeguards previously supplied by the helper process.
No credentials were printed or committed. Generic launcher code and diagnostics
are versioned; generated configuration, .env and logs remain ignored.

Verification: npm start -- --print-config reports frontend 4201 / backend 3001;
npm run start:watch -- --print-config reports 3001 even with shell PORT=3000.
Isolated no-config execution of the actual frontend launcher reported 4200/3000.
Both launchers passed node --check. The first live smoke exposed a literal Angular
configuration interpolation error; corrected it before final verification.
Actual new frontend launcher compiled successfully, returned HTTP 200 on 4201
and served main.js with API localhost:3001. Backend using its ordinary .env
returned HTTP 200 on 3001 and logged keepintax-dev / synchronize=false. No full
production build, paid eval or application unit rerun: startup tooling only,
verified by actual startup and effective-config checks.

Stopped only the verified earlier helper processes and our temporary smoke
processes. Left 4201/3001 free for the user's own terminals. Existing servers on
4200/3000 were not stopped. User commands: npm start from frontend; npm run
start:watch from backend. Full diff/whitespace and documentation targets checked.
Original untracked files preserved. Local feature commit only; no merge or push.
