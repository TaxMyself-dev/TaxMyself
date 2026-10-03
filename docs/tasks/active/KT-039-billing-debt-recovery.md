# KT-039 — Customer debt settlement

- Status: `WORKER_COMPLETE` (local implementation; integration pending)
- Task manager / implementer: Codex
- Worktree: C:/Users/user/.codex/worktrees/billing-debt-recovery/TaxMyself
- Branch: codex/billing-debt-recovery
- Base commit: b5f8e6a7264f97f436998129821506a6a23a9ff3

## Business outcome

Approved by Elazar on 2026-10-04: PAST_DUE customers pay the existing debt
through hosted CardCom checkout; the payment card replaces the saved card for
future renewals. Clearly disclose this before payment.

## Acceptance criteria

- [x] PAST_DUE action opens dedicated debt settlement, not plan selection.
- [x] Show server-derived debt total and explicit card-saving disclosure.
- [x] Recovery reuses the original renewal period and immutable debt amount.
- [x] An unresolved or captured attempt cannot open a second hosted session.
- [x] Focused billing tests and backend/frontend builds pass.

## Scope and constraints

This task completes the first customer recovery slice only. Purchase/upgrade
canonicalization, manual-review resolution, grace/access-policy changes and
isolated live preview infrastructure are subsequent tasks.
No schema, accounting, credentials, live CardCom, database, deployment or push
changes. Original checkout and new-ai-chat worktrees must remain untouched.
The original checkout is dirty; integration is blocked, but Elazar explicitly
authorized implementation in this separate Billing worktree.

## Handoff

- Result: Local implementation complete; primary integration review pending.
- Tests and exact results:
  - Backend `npm test -- --runInBand billing.service.spec.ts
    billing-attempt-orchestration.service.spec.ts billing-lifecycle.service.spec.ts`:
    service, lifecycle and matching admin suite passed (86 tests). The new
    orchestration fixture initially failed to compile; corrected and rerun with
    `npm test -- --runInBand --runTestsByPath
    src/billing/services/billing-attempt-orchestration.service.spec.ts`:
    34/34 passed, exit 0, including a valid hosted recovery after decline
    retries. Total 120 passing backend tests.
  - Final backend `npm run build`: exit 0. An earlier sandbox output-directory
    denial was resolved by narrowly escalated build execution in this worktree.
  - Frontend `npm run ng -- test --watch=false --browsers=ChromeHeadless
    --include=src/app/pages/billing/billing-recovery.page.spec.ts
    --ts-config=tsconfig.billing-verification.json`: 4/4 passed, exit 0.
    The identical config is retained as `tsconfig.billing.spec.json` for reuse;
    rerun with that name after pinned dependency repair also passed 4/4, exit 0.
  - Final frontend production `npm run build`: exit 0, 157.783 seconds.
    Warnings: stylesheet budgets in unchanged generic-table/doc-create/
    my-account/report-review/settings; CommonJS dependencies; initial bundle
    3.13 MB exceeds the 2 MB warning budget. No build errors.
  - `git diff --check`: exit 0.
- Environment: Node 24.13.0/npm 11.6.2; frontend declares Node 20. `npm ci`
  failed on existing missing encoding/iconv-lite lock entries (also with
  legacy peer resolution). Used `npm install --ignore-scripts
  --package-lock=false --legacy-peer-deps` only inside this worktree;
  That first fallback selected newer PDF.js and nested RxJS and production
  build failed on their declarations and duplicate RxJS observable types.
  Repaired installation with temporary `npm install --package-lock-only
  --ignore-scripts --legacy-peer-deps`, followed by `npm ci --ignore-scripts
  --legacy-peer-deps --no-audit --no-fund`; restored package-lock.json afterward.
  PDF.js is now the pinned 4.7.76, with no nested AngularFire RxJS. Package
  manifests/lockfiles remain unchanged. No shared node_modules.
- Impact: no schema, production, accounting or authorization-policy change.
  Internal checkout request adds optional recoveryOnly; existing callers remain
  compatible. CardCom API and credentials unchanged. Recovery state is checked
  under the existing subscription row lock; provider I/O stays outside it.
- Documentation: backend Billing AGENTS.md and frontend billing AGENTS.md.
- Risks: Existing missing-token recovery remains best effort; a failed hosted
  session creation stays blocked pending support, rather than being replayed.
  No real DB/CardCom E2E, DDL-presence verification or isolated backend startup
  was performed. Existing grace access policy is unchanged.
- Integration / origin/main verification: Not performed or authorized.
