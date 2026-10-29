# Unified table row actions

- Status: `PUSHED` (main and codex/integration; verified 2026-10-15)
- Task manager / implementation: current feature chat
- Worktree: `C:/Users/user/Keepintax/TaxMyself-table-actions`
- Branch: `codex/table-actions`
- Base commit: `3b2bf60a03245f0a9ca88374d56d3a3820647047` (verified current origin/main)

## Business outcome

Every available desktop row action is automatically accessible on mobile,
using one actions input and the same visibility and execution rules.

## Acceptance criteria

- [x] Audit all 23 generic-table usages; migrate the 19 action-bearing usages to one actions input and remove mobile overrides.
- [x] Preserve showWhen, file-presence rules, attachment fallback, ordering, loading, labels and desktop presentation.
- [x] Support mobile actions in cards and tables without a mobileCardConfig.
- [x] File replacement receives its input and explicit row; attachment emits once for the selected row.
- [x] Archive predicates apply on mobile and closed-document opposite action uses raw status.
- [x] Focused regression tests and Angular production build pass; topic documentation updated.

## Scope and constraints

- Frontend row-action plumbing and consumer metadata only. Legacy app-table remains unchanged.
- No backend, schema, accounting totals, external API, production access or deployment changes.
- Preserve page action handlers and existing permission predicates.
- Initial implementation used a separate feature branch/worktree. On 2026-10-15 Elazar explicitly requested integration into Keepintax main.

## Handoff

- Result: complete; local commit reported in the chat handoff after creation.
- Tests and exact results:
  - `npm test -- --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.table-actions.spec.json --include=src/app/components/generic-table/*.spec.ts --include=src/app/components/table-row-actions-menu/*.spec.ts`: exit 0, 40/40 passing in Chrome Headless 155 (Windows).
  - `npm run build -- --configuration production`: exit 0; all application templates compiled. Warnings only: existing style/initial bundle budgets and lodash/exceljs CommonJS dependencies.
  - Temporary TypeScript-AST/source audit against the recorded base: 23 table usages, 19 action-bearing tables, 18 action arrays, 61 action definitions. Preserved unrelated input values, callbacks, icons, labels, loading getters, existing showWhen predicates and desktop order. Only approved close-status predicate and VAT replacement cancel handling differ. Audit script removed after passing.
  - `git diff --check`: passed.
- Environment notes: initial npm ci could not use the existing lockfile (missing encoding/iconv-lite). A temporary local package-lock-only refresh allowed isolated npm ci --legacy-peer-deps; the tracked lockfile was restored unchanged. Dependencies were never shared with another worktree. Host Node 24 emits the repository's Node 20 engine warning.
- Schema / production / accounting / external API impact: none. Existing authorization predicates and backend guards unchanged; mobile now respects the same frontend visibility checks.
- Risks / manual checks: real-device native file picker and live file preview/download require a signed-in dev account; no production access or live mutations were used for tests.
- Documentation: generic-table topic/index plus bookkeeping, VAT, report-review, settings, transactions, My Account, admin-billing and clients-dashboard topic notes.

## Intentional behavior corrections

- Missing issued-document and expense mobile actions become automatic.
- Archive showWhen predicates apply to mobile rather than being bypassed.
- Opposite-document action reads original CLOSE status instead of its translated display label.
- Mobile loading actions show a spinner and cannot execute while busy.
- VAT replacement no longer also emits an attachment upload; canceled replacement listeners complete before another row can select a file.

## Main integration — 2026-10-15

- Source feature commit: `7ac0bcad6a300cea8d637e53dff2192ac07ee963`.
- Refreshed main baseline: `5a9afbd331bb5e4a11ec7a9fb82a1ed6bd5b3e61`.
- Integration branch: `codex/integration-table-actions`, using the existing isolated worktree/dependencies.
- Conflict review: retained AccountImageComponent changes in My Account/settings and current main's pending-only SHAAM recovery/resume callback, icon and label. Migrated those current actions to the unified contract; did not restore the obsolete retroactive allocation action. Regression expectation updated to main's policy and explicitly checks dispatch to resumeAutomaticAllocation.
- Integrated frontend tests: exact focused command recorded above, exit 0, 40/40 passing on the final integration commit (including current SHAAM resume callback assertion).
- Integrated frontend production build: `npm run build -- --configuration production`, exit 0. Existing style/initial bundle budget and CommonJS warnings only.
- Reviewed code integration commit: `66379184`. `git show --check` passed; no backend, schema, dependency or environment files changed.
- Delivery: local main was fast-forwarded and `git push --atomic origin codex/integration main` succeeded. Both remote refs were verified at `66379184`; the subsequent documentation-only delivery record is included in the final main tip reported in chat.
- Production deployment/access: none. The primary checkout is on main with the feature available for local use.
