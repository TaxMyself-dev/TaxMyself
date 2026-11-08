# Billing PDF completion recovery

- Status: `LOCAL_MAIN_VERIFIED_AWAITING_MANUAL_TEST`
- Task manager: current billing chat
- Worker: none
- Worktree: C:\Users\user\Keepintax\TaxMyself-admin-refunds
- Branch: codex/admin-refunds
- Base commit: ac2021ff3a6e263b8105a83444ec663055669b83

## Business outcome

Retry local PDF completion after a successful charge without waiting for the next
daily renewal batch, another charge or a replacement invoice.

## Acceptance criteria

- [x] Independent bounded recovery selects only due captured charges.
- [x] Durable 1/5/15/30 minute then hourly backoff, including crash recovery.
- [x] Exclusive lease and existing document/event/journal provenance are preserved.
- [x] Attempt links its existing invoice before PDF work; failure remains retryable.
- [x] Focused billing tests and backend build pass.

## Scope and constraints

- In scope: canonical local completion, retry schedule, diagnostic category, tests.
- Out of scope: old missing documents, accounting/numbering changes, schema,
  new admin UI/alert transport, renderer root cause, production access.
- Required reading: billing AGENTS, coordination workflow/authority/quality gates,
  lessons and production policy.
- Approval boundaries: Elazar authorized review, combined checks and local main
  integration on 2026-11-03; no push or deployment.
  Push requires Elazar's explicit manual test confirmation of current local main
  and explicit push approval under his personal instructions.

## Handoff

- Result: implemented and locally verified; ready for manual development testing.
- Tests: initial focused recovery run passed 6 suites / 145 tests. Final broad
  `npm test -- --runInBand --silent src/billing` passed 34 suites / 524 tests;
  one new assertion expected a refund claim result instead of the existing
  earlier rejection. Corrected that test only, then reran its full suite with
  `npm test -- --runInBand --silent --runTestsByPath src/billing/services/billing-attempt-orchestration.service.spec.ts`:
  1 suite / 52 tests passed. All 525 distinct billing tests are covered by these
  successful final checks. `npm run build` passed on the final executable code.
  Initial sandbox-only attempts could not write Jest cache/build output (EPERM);
  the successful checks ran with approved worktree write access.
- Review: complete scoped diff reviewed; git diff --check passed. No live DB,
  CardCom, signer, mail or storage integration was exercised; mocks only.
- Manual checks: follow docs/features/billing-pdf-recovery.md in keepintax-dev;
  no application server was started and no production repair was performed.
- Schema / production / security / accounting / external impact: no schema,
  production changes, authorization changes, accounting changes or API contract changes.
- Documentation: docs/features/billing-pdf-recovery.md and billing AGENTS.

## Integration

- Not integrated or pushed. Manual dev verification remains required.

## Receipt email follow-up (2026-11-01)
- Status: MANAGER_REVIEW; current chat owns this continuation.
- Follow-up base commit: 81e70ad2; existing feature continued without integration.
- Scope: admin resend existing payment/renewal invoice; failed email retry with existing PDF; no charge, new document, schema, production, merge or push.
- Acceptance: admin authorization, existing-document validation, mail failure scheduling, concurrency protection, focused tests and builds.

### Follow-up result and validation

- Implemented admin resend for PAYMENT_SUCCESS / RENEWAL_SUCCESS using only the
  saved PDF. The pending list now includes unsent emails with linked documents.
- Shared transactional event-row lease and metadata backoff cover automatic,
  manual and post-capture sends. Due failed email events are recovered separately
  from attempt status, including COMPLETED and legacy events. No new cron or
  Cloud Tasks implementation; existing minute runner retained.
- Main focused backend run: 11 suites / 129 tests passed, exit 0:
  `npm test -- --runInBand --silent --runTestsByPath src/billing/services/billing-receipt-email.spec.ts src/billing/services/billing-receipt.service.spec.ts src/billing/services/billing-completion-recovery.service.spec.ts src/billing/services/billing-event.service.spec.ts src/billing/services/admin-billing.service.spec.ts src/billing/admin-billing.controller.spec.ts src/billing/services/subscription-renewal.recovery.spec.ts src/billing/services/subscription-renewal.decline-policy.spec.ts src/billing/services/cardcom-webhook.recovery.spec.ts src/billing/services/cardcom-webhook.post-capture.spec.ts src/billing/billing.module.spec.ts`.
- Additional regression run passed refund/lifecycle/hosted-completion and recovery:
  4 suites / 79 tests passed. That invocation also incorrectly named two nonexistent
  spec files (ENOENT, overall exit 1); corrected renewal/webhook file paths are in
  the successful final 11-suite command above. No product failure was suppressed.
- Frontend: 3 tests passed, exit 0:
  `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.receipt-email.spec.json --include=src/app/shared/admin-billing/pending-receipts/pending-receipts.component.spec.ts`.
- Backend `npm run build`: passed on final executable code, exit 0.
- Frontend `npm run build -- --configuration production`: passed, exit 0;
  warnings for stylesheet/initial-bundle budgets and exceljs/lodash CommonJS.
  No budget/config change or unrelated optimization was made.
- Initial non-elevated builds/frontend tests hit worktree-output EPERM. Successful
  reruns used narrowly approved worktree access. Independent dependencies retained.
- Full diff reviewed; `git diff --check` passed. Tests use mocks, not live DB,
  CardCom, storage or Brevo. No application was started, live mail sent, schema/data
  changed, or production accessed. Manual dev/crash/multi-instance/storage/provider
  integration verification remains in docs/features/billing-pdf-recovery.md.
- Risks: provider acceptance followed by transport/DB failure can duplicate email;
  five-minute leases do not promise exactly-once delivery after crashes/expiry.
  Stored recipient absence is an explicit skip. No charge, new invoice, journal
  or subscription write is reachable from the new admin/email-only recovery path.
- Documentation: billing AGENTS, admin-billing AGENTS, billing-pdf-recovery feature
  guide and this task file. No governance/shared worklog edits.
- Not merged into main, pushed or deployed. Personal manual-main-test/push gate
  remains binding; no push approval is inferred from this task.

- Final compatibility review preserved the existing customer PAYMENT_SUCCESS
  resend action by passing explicit manual intent to the shared delivery claim;
  ownership/type rules are unchanged. Added an ownership/resend regression test.
  `npm test -- --runInBand --silent --runTestsByPath src/billing/services/billing-receipt-email.spec.ts src/billing/services/billing.service.spec.ts`:
  2 suites / 83 tests passed, exit 0. Backend build rerun afterwards passed,
  exit 0. Changes since the successful frontend build/tests were backend code
  plus comments/documentation only. Across successful runs: 15 distinct backend
  suites / 269 distinct tests, plus 3 isolated frontend tests; no live integration.

## Cloud Tasks transition (2026-11-02)
- Status: MANAGER_REVIEW; same chat owns this continuation, base 15f75c10.
- Approved: replace minute completion scan with authenticated Cloud Tasks delivery
  and bounded daily orphan repair; existing schema only, dev implementation only.
- Acceptance: verified Google OIDC identity, durable pending state before enqueue,
  post-commit enqueue hooks for capture/claim/failure/email, DB-authoritative replay
  handling, due/lease protection, mail recovery for completed/legacy charges,
  no additional charge/new invoice on retries, mock integration and backend build.
- No production access, IAM/queue creation, credentials, schema, merge or push.
- Cloud runtime activation remains opt-in with explicit database binding; configure
  dev queue/service account and verify live delivery separately after code review.

### Cloud Tasks implementation handoff

- Result: local code complete; dev cloud activation awaits verified project and
  HTTPS backend details. No queue/service account/IAM/Scheduler/env was changed.
- Transport: existing googleapis dependency with ADC, explicit OIDC identity,
  minimal hashed/named tasks; no new npm dependency or schema.
- Pending DB state/leases commit before all enqueue calls. Task creation failure
  preserves captured/email state. Only ALREADY_EXISTS is treated as dedup success.
- Minute cron removed. External authenticated Cloud Scheduler daily repair is
  required, rather than relying on timers in idle Cloud Run containers. Repair
  enqueues only, paginates by id, caps work, survives independent scan failures
  and returns 503 for partial repair/cap/failure. Daily generations recover queue
  tombstones/exhaustion; same-day repair notifications coalesce.
- New internal endpoints authorize only verified Google OIDC worker identity;
  existing customer/admin authorization is unchanged. Unknown/declined/refund
  attempts never submit payments. Mail processing uses only the saved PDF even
  when its charge attempt is completed/legacy. Capture completion preserves the
  existing canonical invoice/journal uniqueness and provenance checks.
- Validation: `npm test -- --runInBand --silent src/billing` passed 37 suites /
  568 tests, exit 0 on the final executable code. `npm run build` passed, exit 0.
  No frontend executable change, so no repeated frontend tests/build required.
- Earlier non-elevated Jest attempt hit cache EPERM (0 tests executed). A focused
  elevated run found 2 mail-read tests failing because the worker used the
  best-effort audit lookup. Fixed to strict findReceiptTaskEvent (DB error throws;
  missing row is a no-op); 2 focused suites / 25 tests passed, then the complete
  final 37-suite run above passed. No failing product check was waived.
- Unit/mock coverage includes post-commit enqueue vs rollback, enqueue failure,
  deterministic ids/daily regeneration, verified vs spoofed identity, DB/lease/due
  gates, terminal duplicate delivery, failed mail with existing PDF/completed
  attempt, disabled configuration, independent capture/mail repair and pagination.
- Full scoped diff reviewed and git diff --check passed. No live DB/provider,
  signer/storage/Brevo, Cloud Tasks or Scheduler request was made. No app boot,
  production access, credential disclosure, migration, main integration or push.
- Live dev acceptance still required: queue/IAM/token configuration, Scheduler
  invocation from idle runtime, intentional PDF/mail failure, kill/restart,
  enqueue denial, duplicate/multi-instance/manual races, exhausted queue recovery
  and unchanged provider transaction/document/journal counts. Mail ambiguity can
  still duplicate an email; no exactly-once guarantee is made. Old pending work
  after enqueue loss can wait until the next daily repair. A 2000-row repair cap
  or persistent infrastructure error requires operator review.
- Docs: docs/features/billing-cloud-tasks.md, historical notice in
  billing-pdf-recovery.md, billing AGENTS and this task record. No governance edits.
- Push remains gated on Elazar's current local-main manual verification and
  explicit push approval. Neither code completion nor test success grants it.

## Development queue provisioning (2026-11-02)

- User explicitly authorized continuing queue setup after gcloud reauthentication.
  Verified project keepintax-dev / 41317664815 / ACTIVE and billing enabled.
- Enabled cloudtasks.googleapis.com, cloudscheduler.googleapis.com and
  iam.googleapis.com in that project only. No global gcloud project was changed.
- Cloud Tasks does not support me-west1 (verified via API and official location
  list). Created billing-completion-dev in europe-west1 and immediately paused it.
- Verified state PAUSED, no queued tasks, max concurrent dispatches 2, dispatch
  rate 1/second, min/max backoff 60/3600s, maxDoublings 5, maxAttempts 100 and
  maxRetryDuration 604800s. No test task or real billing work was submitted.
- Created billing-worker@keepintax-dev.iam.gserviceaccount.com as the OIDC worker
  identity. No private key was created/downloaded. Granted the authenticated setup
  user queue-scoped roles/cloudtasks.enqueuer and service-account-scoped
  roles/iam.serviceAccountUser on that worker only. Verified Google's Cloud Tasks
  and Cloud Scheduler service-agent roles in the dev project.
- Initial service-discovery calls saw API propagation delay; later enabled-service
  listing and Tasks location/queue APIs succeeded. No permission failure was
  bypassed with project-wide admin grants.
- Local ngrok API was unavailable. No backend/app was booted, no DB accessed and
  no live mail, charge, invoice, webhook or production resource was touched.
- Pending activation: verified local keepintax-dev backend + active HTTPS tunnel,
  correct application-default credentials (gcloud CLI login alone does not prove
  runtime ADC), local task env settings, daily Scheduler job targeting the current
  tunnel, identity/retry acceptance tests, then explicit queue resume. Keep the
  queue paused and BILLING_TASKS_ENABLED off until these are ready. No Scheduler
  job was created using an old/unverified tunnel URL. Existing env and credentials
  were not overwritten.
- Only documentation changed locally in this step; cloud read-back checks above
  are the validation. Existing 37-suite/568-test code validation remains unchanged.
  No merge, push or production deployment.

## Local tunnel and Scheduler preparation (2026-11-02)

- User reported ngrok forwarding port 3000. Elevated local inspection verified
  HTTPS tunnel margeret-guttiform-overfondly.ngrok-free.dev -> localhost:3000.
- Read-only process inspection found port 3000 belongs to the primary checkout;
  main does not contain Cloud Tasks commit 0d0ccb74. No process was stopped,
  restarted or replaced, and main was not modified/integrated.
- No runtime ADC file exists and no process GOOGLE_APPLICATION_CREDENTIALS override
  is present. CLI login works but does not supply application-default credentials.
  Runtime ADC login requires the user's interactive Google authorization.
- Verified feature backend env DB_DATABASE=keepintax-dev and that backend/.env is
  Git-ignored. Added only 8 previously absent BILLING_TASKS_* settings with the
  dev project/queue/worker, europe-west1 and this verified HTTPS target/audience.
  Existing keys, credentials and other environment values were preserved.
  BILLING_TASKS_ENABLED remains false. No DB connection or application boot.
- Created billing-completion-repair-dev in europe-west1 in keepintax-dev with
  POST /internal/billing/repair at the verified tunnel, exact worker OIDC identity
  and tunnel-base audience, daily 04:00 Asia/Jerusalem, 300s deadline and 3 retries.
  Paused immediately; read-back confirmed PAUSED and expected URL/auth/schedule.
  No manual Scheduler run or task submission occurred. The queue remains paused.
- Still required: runtime ADC, a backend containing the feature with verified dev
  configuration, live identity/retry tests and only then resume queue/Scheduler
  and enable local completion delivery. A changed tunnel needs env/job updates.
- Documentation-only tracked changes; no executable changes or repeat builds.
  No production access, live charge/mail/invoice, env commit, merge or push.

## Dev runtime connection (2026-11-02)
- User explicitly authorized updated feature code on port 3000, dev only and no
  additional charge. Current port is free; main is not changed or integrated.
- ADC consent failed (cloud-platform scope not consented); user was given the
  exact login repair and can finish while local safety runtime is implemented.
- Adding an opt-in completion-only dev startup profile: keepintax-dev binding,
  synchronize/boot seed off, all schedule decorators off, CardCom network entry
  points blocked and HTTP routes restricted to health/readiness/task endpoints.
- Acceptance: guarded actual-dev DB preflight, updated worktree code on 3000,
  verified local/ngrok endpoint identity and queue test with no-op missing-row id,
  zero provider/charge/mail/document writes, and no production/main/push.

### Connected dev runtime handoff

- Result: updated compiled feature code running on port 3000 with isolated
  completion-only profile. No main code or existing user process was changed;
  port was free, then only our own worker was restarted to enable the task flag.
- New opt-in profile validates dev DB/project binding, disables synchronize,
  boot seeding and all Nest schedule decorators. HTTP only permits readiness/
  health and authenticated task routes; CardCom's seven network entry points
  reject before HTTP. Normal profile remains unchanged.
- Initial ADC login had failed because cloud-platform consent was absent. The
  user completed consent during the turn; ADC then existed and the official
  Google client read the dev queue with verified keepintax-dev quota project.
  No token/key was printed or committed. Local ignored BILLING_TASKS_ENABLED
  changed false -> true only after this verification; other env preserved.
- Guarded read-only SELECT DATABASE verified actual keepintax-dev binding.
  Before/after counts were attempts=11, documents=46, events=94. No pending
  captured charges or attempted failed invoice emails were present.
- Local ready returned 200; no-identity completion 403; checkout/daily-task
  returned 503 before any provider/controller invocation. Public curl health
  through ngrok returned 200 (PowerShell's public HTTPS client timed out; curl
  and the actual Google deliveries succeeded, so no host network change was made).
- Compiled application publisher created the sole MAIL task for missing event
  id 2147483647, verified absent beforehand. Resumed dev queue; inbound authenticated
  completion returned 204 and Cloud Tasks removed the completed task. No provider,
  PDF, mail or invoice creation ran for this missing row.
- After confirming zero pending work, resumed Scheduler and forced its daily
  repair once: ngrok recorded repair HTTP 204, Scheduler status OK, no tasks
  created. An initial run while paused was rejected by Google with
  FAILED_PRECONDITION and did not execute; enabling then running succeeded.
- Final dev queue RUNNING/empty; Scheduler ENABLED at 04:00 Asia/Jerusalem.
  No production access, schema change, main integration, deployment or push.
- Validation: focused 4 suites / 33 tests passed, then final
  npm test -- --runInBand --silent src/billing passed 38 suites / 572 tests,
  exit 0. npm run build passed, exit 0. Actual local readiness/HTTP restrictions,
  guarded dev reads and both external authenticated delivery paths passed above.
- Documentation: billing AGENTS, feature guide and this task record. No frontend
  code changed, so frontend checks were not repeated. Full source diff reviewed;
  git diff --check passed. Env stays ignored. Live PDF/mail failure and crash/race
  scenarios with an actual existing test invoice remain separate acceptance work;
  no real customer mail or invoice was processed to claim those scenarios passed.
- Push requires renewed personal manual-main verification and explicit approval
  for the current executable revision. No such approval is inferred here.

## Real dev retry acceptance (2026-11-02)
- User authorized controlled PDF/mail failures and real retry recovery on an
  existing dev invoice, without new charge or invoice. Using local Chromium
  preview PDF/storage and local MIME sink; Google queue, OIDC, DB and retry
  schedules are real. Signing/Firebase/Brevo production boundaries are not called.
- Scope is existing dev attempt 2 / event 50 / invoice document 19 (30000).
  Legacy canonical links and temporary test state will be snapshotted/restored;
  original stored PDFs are never read, overwritten or re-signed.
- Local-only adapters require isolated dev profile and matching DB/project;
  no remote fault-control endpoint. New invoice creation is fail-closed.


### Verified controlled recovery results

On 2026-11-02 the real dev DB, compiled worker, Google Cloud Tasks/OIDC and
local Chromium renderer passed both controlled failure scenarios on existing
invoice 30000 (document 19, attempt 2, event 50). PDF generation failed once,
remained CAPTURED with the same document pointers, then recovered after the
real scheduled retry. Mail then failed once with socket hang up while the
attempt was COMPLETED; its second delivery attempt succeeded using identical
PDF paths and SHA-256, without rendering again. No retry timestamp was advanced.
No new invoice or charge attempt was created. Provider calls and invoice
creation were blocked. Signing, Firebase storage and Brevo were replaced with
local preview files/MIME sink, so this does not verify real provider delivery.

The runner snapshotted/restored the legacy canonical links and five affected
rows, removed only its tagged audit events and exact recorded tasks, and
verified final counts: 11 attempts, 46 documents, 94 events. Original stored PDFs
were never read or modified. Normal isolated worker was restarted without fault
adapters; dev queue resumed RUNNING and daily Scheduler ENABLED. Production,
main and GitHub were untouched.

Reproduction: build backend, pause the dev Scheduler, ensure the queue is empty,
then run `node scripts/qa/verify-billing-recovery-dev.cjs init`. Start the isolated
worker with BILLING_DEV_RECOVERY_PROBE_CONFIG pointing at the returned private
config.json, then run `node scripts/qa/verify-billing-recovery-dev.cjs run PRIVATE_RUN_DIRECTORY`.
The runner validates actual DB and ADC quota project, restores fixtures in finally
and leaves queue/Scheduler paused for normal-worker restart and explicit resume.
Keep the private snapshot until restoration succeeds; never commit it. The
fixture intentionally supports only the verified existing dev records and fails
closed when their prerequisites differ. It is not a legacy data migration.

Validation for this revision: backend build passed; native adapter guard tests
2/2 passed; billing-related Jest suites 39/39 and tests 574/574 passed;
git diff --check passed. Actual queue empty after normal worker restart.

## Authorized local main integration (2026-11-03)

- Elazar explicitly authorized review, combined checks and a local main merge;
  push remains prohibited until he personally tests this current main revision
  and explicitly approves it. No production access or deployment is authorized.
- Fetched origin; local main and origin/main both resolved to
  978ea5ca792105d0084da7e6ed13c6c48ecce9a2 before integration, with clean checkouts.
- Reviewed all seven feature commits and the final scoped diff: canonical invoice
  reuse, no provider resubmission during completion, post-commit enqueue, durable
  leases/backoff, verified Google identity, real admin guard and local-only probes.
  No blocking review findings, schema/accounting changes or secrets were found.
- Integrated main into this existing feature worktree at e25fa17e. Resolved two
  conflicts additively: retained both start commands; retained Lychee/WhatsApp
  imports and the DISABLE_SCHEDULED_TASKS global switch alongside the isolated
  completion profile. Added a regression covering the global switch with the
  isolated profile disabled. The occupied codex/integration worktree was not touched.
- Combined-tree validation, all exit 0:
  - backend npm test -- --runInBand --silent --testPathPattern=billing:
    39 suites / 575 tests passed (276.72s).
  - node --test scripts/qa/billing-recovery-faults.test.cjs: 2 tests passed.
  - backend npm run build: passed.
  - frontend npm test -- --watch=false --browsers=ChromeHeadless
    --ts-config=tsconfig.receipt-email.spec.json
    --include=src/app/shared/admin-billing/pending-receipts/pending-receipts.component.spec.ts:
    3 tests passed in real headless Chrome.
  - frontend npm run build -- --configuration production: passed, with nonfatal
    stylesheet/initial-bundle size and CommonJS optimization warnings.
  - Every feature commit git show --check and final git diff --check: passed.
- Prepared the validated descendant for fast-forward into the clean main checkout.
  No remote push, production connection, live mail/payment or DB change occurred
  during integration verification. Prior real dev queue recovery evidence remains
  above; provider signing/storage/mail were local adapters in that acceptance run.
- This is source integration only: ignored main env and existing running servers
  are not replaced or restarted. Runtime startup is separate from Git integration.
