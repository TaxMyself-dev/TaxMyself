# Lychee caption routing and optional sender

- User authorized local implementation only; no deployment, GitHub push,
  messages, environment changes or channel-ID changes.
- Sender fallback accepts missing/null/blank sender_phone using contact_phone.
  Invalid or conflicting nonempty sender still fails closed. Backend reuses the
  same resolver for validation, user lookup and queue/reply scope.
- Proxy dev routing requires BOTH existing LYCHEE_TEST_PHONES membership and a
  standalone whitespace-delimited #dev token in signed text, case insensitive.
  All other events route to prod. Legacy LYCHEE_TEST_MODE is no longer used.
- Config requires a dev HTTPS destination whenever test-phone list is nonempty.
- Raw signature/body are preserved. Unavailable dev never falls back to prod.
- The test-phone list itself was not changed. No cloud state was read/changed.
- Reply environment affinity is not implemented: an unmarked quoted reply goes
  to production. Sending prompts remains absent; resolve durable ownership before
  enabling multi-business conversations. No schema changes in this task.
- Verification: proxy tests 11 passed; focused backend tests and Nest build
  results recorded in chat. All external boundaries mocked.
