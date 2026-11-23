# Retry full banking sync from a stored error

- Status: VERIFIED_LOCAL
- Task manager: Codex
- Worker: Codex; independent read-only review_full_sync_retry
- Worktree: TaxMyself-banking-full-sync-retry
- Branch: codex/banking-full-sync-retry
- Base commit: ebb26b44 (main verified equal to origin/main)

## Business outcome

The owner can request a new full transaction pull directly from a retained banking sync error on Home and Transactions.

## Acceptance criteria

- OB-03/OB-04 toast offers משוך מחדש את כל התנועות and uses existing POST /transactions/trigger-sync.
- Capture preceding run, wait for the new outcome, join an existing run, block repeated clicks.
- Preserve cached display on failure; clear matching notification on resolved outcome.
- Hide owner action for disconnected/represented users; invalidate callbacks after navigation.
- Test actual button-to-HTTP behavior without live provider or production access.

## Boundaries

Frontend only. No backend/API/schema/accounting changes, production writes, deployment or push. Local main integration is for Elazar's personal verification; push requires his explicit current-main manual-test confirmation and push approval.

## Validation

Focused Angular suites passed: 38/38 tests, ChromeHeadless, exit 0. Includes 19 new rendered-action/HTTP/page-handler tests and prior toast, polling and disconnected-state regressions. Independent read-only review: no blockers after fixing eligibility recheck before POST. Production frontend build passed (exit 0); bundle/style budget and existing CommonJS warnings remain. No live backend/provider access.
