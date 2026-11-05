# Banking retry table loading feedback

- Status: READY_FOR_LOCAL_MAIN_VERIFICATION
- Branch: codex/banking-full-sync-retry (continuing existing feature)
- Base: d49fddb477c9ce787d9a194f90cb124b38030803, verified clean local main.
- Worktree: TaxMyself-banking-full-sync-retry

## Acceptance
- Full-sync retry immediately uses the existing table loader, even with retained rows.
- Desktop dashboard and income/expense tables, plus mobile cards, show progress independently of toast lifetime.
- Loader continues through sync and refreshed table-data read, ending on completion/error.
- Existing data survives failed pulls. No backend, schema, production or push changes.

## Validation
- Focused rendered table + full-sync retry selection: 40/40 passed in ChromeHeadless.
- Angular production build passed with existing bundle/component-budget and CommonJS warnings.
- Wider generic-table selection: 63 passed, 1 failed. Reproduced the same unrelated failure on unchanged main d49fddb4: table-action-consumers.spec.ts, pending tax invoice allocation action calls IncomesPage.confirmResumeAutomaticAllocation with no messageService stub (undefined.add). Baseline selection: 10 passed, 1 failed. No income behavior or test fixture changed.
- Evidence: retry-table-loader-focused.txt, retry-table-loader-build.txt, retry-table-loader-tests.txt and retry-table-loader-baseline.txt in investigation workspace.
- Full diff reviewed and whitespace gate passed. Schema/production/backend/security/accounting/API impact: none.
- Local main verification pending; manual test/push approval remains with Elazar. No push or production access.
