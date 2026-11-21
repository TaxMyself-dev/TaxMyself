# Shared document AI queue

- Status: IMPLEMENTED / DEV SCHEMA APPLIED; WORKERS NOT STARTED
- Worktree: TaxMyself-document-ai-queue
- Branch: codex/document-ai-queue
- Base: de8369bc (verified clean local main)

## Acceptance

- Every document-analysis entry point enqueues durable work; no source bypasses admission.
- One tenant may consume all spare capacity; competing tenants and interactive work progress fairly without reserved idle slots.
- Shared provider/model request/token budgets and active leases apply across server instances without holding a DB connection during AI calls.
- Frozen provider/model/policy, saved results, unknown outcomes and idempotent completion survive restarts.
- Existing review, transaction linkage, temporary form-fill, protected originals and source-specific retention rules remain intact.
- No real OpenAI adapter, agent branch changes or external queue infrastructure.

## Milestones

1. Done: durable contracts/store, provider interface and capacity/fairness engine; mocked tests (`297090bd`).
2. Done: worker, recovery and usage/timing telemetry; mocked crash/admission checks (`10e9b249`).
3. Done: Gmail, INBOX/Drive/WhatsApp and protected replacement routing; transactional Gmail handoff, retained restoration/dedup (`10e9b249`).
4. Done: asynchronous form fill and transaction-link UI/API; stale-result/edit protection and report-page waiting (`2bfa9764`).
5. Done: prepared SQL, cutover/backfill guidance, documentation, bounded verification and builds. No live activation.

## Boundaries

No schema application, existing-work migration, live DB/provider/app bootstrap, real AI, document deletion, PROD, main integration, push or deploy. Only prepared schema/code and mocked/local tests. The separately approved cleanup removed only the primary checkout's Angular cache. DEV environment files were copied to this new worktree; no secrets are tracked. Main's 4200/3000 defaults stay unchanged; ignored feature backend configuration uses 3004 and return URL 4204. No app is started.

## Handoff

### DEV schema authorization — 2026-11-22

Elazar explicitly authorized applying the schema to DEV only, with AI and deletion still prohibited. A standalone mysql2 helper loaded only the feature's ignored backend environment and rejected any database other than `keepintax-dev`. Read-only preflight found both queue tables absent and no configured `DOCUMENT_AI_*` keys. Only the two CREATE TABLE statements from `docs/features/document-ai-queue.sql` were executed; the full cutover script and application were not run.

Read-only verification confirmed `document_processing_jobs` has all 43 expected columns, its primary key, two unique indexes and four dispatch/tenant/lease/cleanup indexes; `document_ai_capacity` has all three expected columns and its primary key. Both tables contain zero rows. No old jobs or user data were copied/updated, no AI/provider/deletion call was made, and no frontend/backend process was started. Ports 3004/4204 had no listeners at preflight. Production was not connected.

The earlier implementation/verification record below describes the pre-authorization snapshot. DEV schema creation is now verified against the real engine; live contention/recovery and application/provider behavior remain unverified. Capacity settings have not been filled with invented values. UI testing must first use an isolated backend with automatic workers suspended: missing capacity configuration alone does not disable the existing Gmail deletion or protected-file workers. A normal full backend startup is not a safe no-deletion test mode.

Implementation documentation: `docs/features/document-ai-shared-queue.md`. Two prepared tables are in `docs/features/document-ai-queue.sql` and the required appended block in `docs/redesign/cutover.sql`. No schema was applied and no old job was migrated.

Final executable revision: `2bfa9764` (backend milestone `10e9b249`). Later task-record updates change documentation only. Feature configuration is ignored: frontend 4204, backend 3004, API `http://127.0.0.1:3004/`; `node frontend/scripts/start-local.js --print-config` verified these values without starting servers. Both local config and `backend/.env` were confirmed ignored.

### Final verification

All commands below ran locally inside this feature worktree. Provider/DB/Drive interactions were mocked; native PDF tests use local artificial inputs. No app bootstrap, live provider, DEV database operation or Drive deletion occurred.

Backend, from `backend/`:

```powershell
$queueSpecPaths=@(Get-ChildItem src/document-ai -Filter '*.spec.ts' | ForEach-Object FullName)
$sourceSpecPaths=@(Get-ChildItem src/email-intake -Filter '*.spec.ts' | ForEach-Object FullName)
$protectedSpecPaths=@(Get-ChildItem src/protected-pdf -Filter '*.spec.ts' | ForEach-Object FullName)
node node_modules/jest/bin/jest.js --runInBand --silent --runTestsByPath @queueSpecPaths @sourceSpecPaths @protectedSpecPaths src/documents/documents-inbox-restore.spec.ts src/documents/documents-inbox-lock.spec.ts src/documents/documents-ocr-at-most-once.spec.ts src/documents/documents.controller.scope.spec.ts src/documents/email-ai-outcome.spec.ts src/documents/document-outcome.spec.ts src/documents/gmail-extraction-prompt.spec.ts src/documents/documents-get-documents.spec.ts src/reports/report-review-identity-scope.spec.ts src/reports/report-review-read-only.spec.ts
npm run build
```

Result: **33 suites / 214 tests passed**, no snapshots, 47.213 seconds; Nest build exit 0. Coverage includes one business filling all eight mocked slots, 300-job bounded draining, competing-tenant fairness, frozen provider/model, a fake OpenAI adapter, saved-result continuation, unknown-outcome retention, rollback state restoration, atomic Gmail handoff, scoped ownership, protected PDFs, reference-safe deletion, temporary-file cleanup and stale transaction linking. This is a bounded affected suite, not the repository's entire backend suite.

Frontend, from `frontend/`:

```powershell
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.document-ai.spec.json '--include=src/app/services/document-analysis*.spec.ts' --progress=false
node node_modules/@angular/cli/bin/ng.js build --configuration production
```

Result: **7 tests passed**, command exit 0. Production build exit 0, hash `2f2035443123f63c`, 39.503 seconds. It emitted SCSS/initial bundle size and CommonJS warnings; no base-revision rebuild was performed to label those warnings as baseline. Development build also passed on the earlier UI snapshot; the production result above includes the final report-page fix.

`git diff --check` and `git show --check` passed for implementation commits. No env/dependency/cache/build output or agent module entered the feature commits. Full-repository frontend tests, real MySQL contention/restart tests, real quota calibration and live end-to-end tests were not run.

### Diagnostic history and limits

An intermediate bounded backend run had 206 passing tests and one rollback-state test failure; the failure was reviewed and fixed, then the affected cases and the final 214-test checkpoint passed. Earlier 26/45/82-test results describe intermediate milestones, not independent final suites to add to 214. Two initial path patterns accidentally matched the worktree's own name and selected overly broad Jest runs; those runs were stopped and are not passing evidence. Exact source paths were used for the final checkpoint.

Real MySQL syntax/locking under contention, SDK throughput, Drive authorization and application startup remain unverified under the explicit no-live-operations boundary. Before DEV activation: authorize schema application separately, supply reviewed quota/measurement values, audit existing in-flight/unknown work, and explicitly agree which synthetic documents may run. Existing staging remains during transition. OpenAI has a provider interface and fake-contract test, not a live implementation. Background progress requires a process with CPU time; no deployment policy was changed.
