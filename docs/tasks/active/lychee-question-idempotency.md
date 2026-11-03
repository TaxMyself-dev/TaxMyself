# Business-question Idempotency-Key

- Scope: local backend change with mocked HTTP/SQL tests only. No real sending,
  requeue, deployment, main integration or push.
- Each send receives the immutable prompt outbox event_id from the service.
  HTTP Idempotency-Key is a versioned development namespace plus SHA-256 of
  channel and question identity. It excludes credentials, phone, text, attempts,
  leases and timestamps; recreating the sender preserves the same key.
- Distinct questions/channels get distinct keys. Missing/malformed operation IDs
  fail before HTTP. Existing development guard, receipt mapping, single-attempt
  delivery and PROMPT_UNKNOWN quarantine remain unchanged.
- No schema changes or automatic retries of existing questions. Provider-side
  deduplication semantics are not assumed from merely requiring the header.
- Verification: 36 distinct mocked tests passed across transport, diagnostic and
  outbox suites (service rerun after fixing a fixture channel assertion); Nest
  build and git diff --check passed.
