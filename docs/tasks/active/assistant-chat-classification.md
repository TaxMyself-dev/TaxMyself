# Assistant Phase A one-time transaction classification

- Status: IN_PROGRESS — the 2026-11-17 traced rerun found an open continuation/card issue
- Task manager and worker: Codex, same agent; no delegation
- Worktree: existing TaxMyself-new-ai-assistant feature worktree
- Branch: new-ai-assistant
- Base: 366f2748c32f57bc3afc7fa20d9793f4f53e6f49
- User approval: 2026-11-17, implementation, tests and documentation only.

## Business outcome

Chat can find a pending outgoing bank/card transaction, propose an existing
effective category and apply its one-time classification after the user's card
approval. It uses the catalog/card's existing accounting defaults. It never
approves an expense, changes a confirmed transaction or creates a standing rule.

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
The client may send an approval decision, never replacement action input.

AgentClassificationService rechecks access, OPEN_BANKING and current ACTIVE
delegation EXPENSES_APPROVE scope. An owner represented by an accountant retains
the existing classification-only behavior. The source is owned, outgoing,
account-linked, pending and unlocked; the target is an effective existing
mapped/private subcategory. Percentages/recognition/equipment come from its card.

TransactionProcessingService.classifyPendingForAgent locks owner/cache/slim in
one DataSource transaction, performs preflight and runs existing classifyManually
on transaction-scoped repositories with classificationOnly=true. No new expense,
journal or rule path is called. Existing UI paths are unchanged.

Proposals expire after 30 minutes. Signing is process-local: restart/deployment
or another backend instance invalidates an outstanding proposal safely. A new
card is then required. Shared/persistent signing for multi-instance rollout is
not part of this local feature delivery.

No batches, standing rules, confirmed-row edits, expense approval, document
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
