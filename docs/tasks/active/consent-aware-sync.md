# Consent-aware transaction sync and provider diagnostics

- Status: READY_FOR_LOCAL_MAIN_VERIFICATION
- Manager: Codex
- Worktree: TaxMyself-consent-aware-sync
- Branch: codex/consent-aware-sync
- Base: affdba17530540470f8594a4bd388f66207bd6c4 (verified clean local main; origin/main ebb26b44)

## Acceptance criteria
- Full sync fetches only locally permission-linked sources per permanent sourceRecordId and identity.
- No linked sources of a type means no request and no user error for that type.
- Every expected source has an outcome; missing resources, empty lists and denied access are failures.
- Unlinked sources remain normal, with no reconnect alerts or automatic permission changes.
- Empty transaction periods are successful; storage failures remain visible.
- Existing Direct exclusions stay successful; future ordinary Direct imports follow ordinary outcomes.
- New connection discovery/data-ready webhook flow remains unchanged.
- Discovery HTTP errors include sanitized bounded provider bodies and operational correlation IDs.
- Focused regression suites and backend build pass; no production/provider calls, schema changes or push.

## Validation and handoff
- Feature checks: 32 Feezback/source-state suites passed (436 tests before final edge additions); final focused selection passed 54 tests in 3 suites, including 40 consent-aware tests. Nest build passed. Local evidence: consent-aware-regressions.txt, consent-aware-verified.txt, consent-aware-final-build.txt in the investigation workspace.
- Review: complete executable diff reviewed; whitespace check passed. An obsolete assertion that account errors stay quiet was updated to an unrelated endpoint. No known pre-existing failures.
- Schema / production / security / accounting / external impact: no schema changes, live API calls, DB writes, production access, accounting changes or external API contract changes. Diagnostics retain credential redaction and bounded bodies.
- Direct feature integration: ordinary imports are enabled by that feature making skipped_direct retryable. Current intentional skips remain non-errors; positive credit classification overrides stale Direct status. Combined branch integration should rerun both feature regressions.
- Local main integration authorized by repository workflow; remote push is forbidden until Elazar manually tests current main and explicitly approves.
- Main integration: executable commit 30e7b7dd fast-forwarded onto clean local main.
- Exact integrated-main verification: npm test -- --runInBand feezback user-sync-state.service.spec.ts passed 439 tests in 32 suites; npm run build passed. Evidence: consent-aware-main-tests.txt and consent-aware-main-build.txt in the investigation workspace.
- Manual main verification and push approval: pending Elazar. No remote push or deployment performed. Restart the local backend, then use the full-sync retry action to exercise a new run.
