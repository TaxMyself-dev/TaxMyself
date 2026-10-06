# KT-045 — Admin billing exception resolution

- Status: `WORKER_COMPLETE`
- Worktree: billing-debt-recovery/TaxMyself
- Branch: codex/billing-debt-recovery
- Base commit: 733cebe43309aab13daf5f98c69e4d66237e7c6e

## Business outcome

Elazar authorized manual treatment of all blocked payment attempts through the admin panel.

## Acceptance criteria

- [x] Show every unresolved attempt status and operator action in subscription details, plus resolved history.
- [x] Read-only provider reconciliation never charges; captured completion reuses the existing receipt pipeline.
- [x] Release requires explicit documented proof of no charge and a terminated checkout; captured payments cannot be released.
- [x] Check version, subscription membership, live leases and all collection reservations under locks; audit actor and decision atomically.
- [x] Record hosted creation failures and give customers an actionable pending-review message.
- [x] Focused backend/frontend verification and production builds; local commit only.

## Constraints

No new schema, no production, no credential changes, no live provider calls during implementation. Preserve the user's parallel new-ai-chat checkout.

## Verification and handoff

- Backend: direct Node Jest CLI, `--runInBand --silent --runTestsByPath` with every spec returned by `rg --files src/billing -g '*.spec.ts'`: **25 suites / 360 tests passed**, exit 0, 42.844s.
- Frontend: direct Angular CLI `test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.billing-resolution.spec.json` with subscription specs and recovery page spec: **14 tests passed**, exit 0.
- `npm run build` backend: exit 0. `npm run build` frontend: exit 0; existing 3.14MB initial budget, component style budgets, lodash/exceljs CommonJS warnings remain.
- Initial tests exposed intentional old invariants and outdated fixtures; changes now preserve the ordinary MANUAL_REVIEW no-charge prohibition and use a separate guarded operator decision. A transient admin fixture lease lacked its owner and was corrected.
- One incidental npm invocation dropped intended filtering and ran unrelated backend suites. It failed outside billing (including users/reports/document/catalog fixtures); no whole-repository success or newly established baseline claim is made. Final verification uses direct scoped CLI commands above.
- Sandbox denied build/cache writes initially; narrow build/test escalations succeeded. A diagnostic JSON results-file write was denied; no evidence file was retained, and the final run passed without a results file.
- Schema/production/accounting/external API contract impact: none. Receipt amounts/period snapshots and existing receipt issuance pipeline are reused. Auth policy unchanged: the existing real-actor admin gate protects the new action.
- Changed scope: billing controller/module/DTOs; orchestration/lifecycle/checkout/CardCom/renewal/admin services; subscription drawer/service/presentation and recovery messaging; focused specs/config; three topic AGENTS.md files and this task.
- All provider I/O during automated tests is mocked. Actual CardCom credentials, connectivity and a successful end-to-end payment remain a manual dev check.
- Operator no-charge confirmation must be backed by provider evidence of no payment AND a no-longer-payable checkout; neither absence of a local transaction nor a failed lookup suffices. Unknown outcomes remain blocked.
- Legacy stuck CREATED attempts remain visible for the user to resolve in the new panel; this implementation does not silently rewrite existing dev test data.
- Run: restart backend/frontend from the billing worktree with the existing safe dev settings, then Admin panel → Billing → Subscriptions → Details → Billing exceptions. A rejected old checkout can be closed through the documented no-charge action, then the customer refreshes recovery.
- Local commit only; no push, merge, production or changes to the parallel new-ai-chat checkout.
