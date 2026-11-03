# Question delivery timing diagnostics

- Add durationMs per operation; no changes to ordering, retries, persistence,
  claims, immediate scheduling, development guards or receipt extraction.
- business.prompt.db.claim: claim/lease time, emitted only when a job exists.
  db.document / db.user / db.businesses: individual preflight SQL lookups.
  db.environment: actual development-connection check in the transport.
- business.prompt.http.send: only the axios POST round trip. Optional
  http.receipt_lookup: only the message-get GET round trip.
- business.prompt.db.receipt: durable receipt write (includes the existing
  single persistence retry if needed). db.mapping: document mapping write/read.
  db.finish: final outbox status write.
- Existing business.prompt.send duration is aggregate transport time (includes
  environment check, POST and any receipt lookup); business.prompt.link duration
  aggregates mapping + final status. Do not sum aggregates with their children.
- HTTP/transport stages use the outbox question ID; service DB stages use the
  parent document event ID. Existing receipt mapping links these identities.
- Success and failure timings contain only static descriptions, milliseconds and
  existing sanitized diagnostics. Work results/raw exceptions/headers are never
  serialized. Rethrow the original error so quarantine semantics stay unchanged.
- Mocked verification uses controlled clocks with distinct durations per phase,
  failure identity/no retry, no result/secret leakage and normal outbox regressions.
- No real sends, API/DB calls, requeue, deployment, main integration or push.
- Verification: 68 mocked timing, transport and outbox tests passed; backend
  build and git diff --check passed.
