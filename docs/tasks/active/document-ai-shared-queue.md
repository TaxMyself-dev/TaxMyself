# Shared document AI queue

- Status: APPROVED / IN PROGRESS
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

1. Durable contracts/store, provider interface and capacity/fairness engine; mocked tests.
2. Worker, recovery and usage/timing telemetry; crash and contention tests.
3. Gmail, INBOX/Drive/WhatsApp and protected replacement adapters; no dual ownership.
4. Asynchronous form fill and transaction-link UI/API; stale-result protection.
5. Prepared SQL, migration plan, documentation, focused integration checks and builds.

## Boundaries

No schema application, existing-work migration, live DB/provider/app bootstrap, real AI, document deletion, PROD, main integration, push or deploy. Only prepared schema/code and mocked/local tests. The separately approved cleanup removed only the primary checkout's Angular cache. DEV environment files were copied to this new worktree; no secrets are tracked. Main's 4200/3000 defaults stay unchanged; ignored feature backend configuration uses 3004 and return URL 4204. No app is started.

## Handoff

Pending implementation and evidence.
