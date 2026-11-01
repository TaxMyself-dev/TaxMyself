# Development-only business-question activation

- Status: MANAGER_REVIEW
- Worktree: TaxMyself-whatsapp; branch: codex/whatsapp-integration.
- Base: 14c1c3c7. User explicitly authorized live question sending in dev only,
  without deployment or push. Success/failure notifications remain deferred.
- Register DevelopmentOnlyPromptTransport. Require NODE_ENV=development,
  actual DataSource database keepintax-dev, key/channel and a matching request
  channel/quote; verify SELECT DATABASE() before external HTTP.
- No new flag or credential changes. Local ignored configuration already meets
  requirements. No fake provider IDs or automatic resend after uncertain outcome.
- Tests use mocked HTTP and fake databases, including blocked production names,
  production/test/unset NODE_ENV, mismatched connection/channel and missing config.
- No manual live question, production connection, DB writes, schema/grant changes,
  main integration, deployment or push performed during implementation.
- Proxy dev-reply routing remains undeployed; full real button-choice testing
  requires the separate future proxy integration/deployment already documented.
- Verification: 7 focused Lychee suites / 61 tests passed; Nest build and diff
  checks passed. All HTTP/database test boundaries were mocks. Existing receipt
  persistence, ambiguity quarantine and duplicate-prevention tests still pass.
- Reviewed local changes; local feature commit only. No real test message was
  initiated. Restart/reload the local backend to use the new binding.
