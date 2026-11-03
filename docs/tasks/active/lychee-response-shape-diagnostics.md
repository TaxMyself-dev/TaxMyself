# Send response field/type diagnostics

- Local feature change only; no real HTTP/database calls, requeue, deployment,
  main integration or push.
- business.prompt.response records the question outbox ID, HTTP status (when
  available), and responseShape: bounded field paths and types. It runs for send
  success or HTTP failure and never copies response primitive values, request
  payloads, response headers or Axios config.
- Maximum depth 3, 40 entries and 20 keys per object; array inspection uses only
  the first item and logs neither values nor array lengths. Sensitive subtrees,
  unusual/dynamic keys and configured secrets used as keys are omitted. Object
  accessors are not evaluated; cycles are bounded.
- No change to receipt resolution, idempotency keys or no-resend quarantine.
- Mocked verification: 26 response-shape and transport tests passed; includes
  actual logger capture ensuring private IDs, phone, text and credentials are
  absent from schema log output. Backend build and diff checks also run.
