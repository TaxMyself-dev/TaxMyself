# Lychee proxy direct development storage

- Status: MANAGER_REVIEW
- Task manager: current WhatsApp feature chat
- Worktree: TaxMyself-whatsapp; branch: codex/whatsapp-integration
- Base commit: f83a3cca

## Business outcome / acceptance

- Proxy handles allowlisted test commands and routes captionless dev documents
  using shared development SQL, without calling a production backend for mode.
- Persist mode across replicas, isolate senders and retain event routes on retry.
- Reject any DB name except keepintax-dev; no schema or grant changes.
- Leave quoted ownership routing and existing Feezback/Cardcom behavior unchanged.
- Provide explicit server settings and offline tests; no deploy/push/messages.

## Implementation

- mysql2 pool with lazy initialization, dev-only configuration, verified TLS by
  default and explicit opt-out only. No automatic downgrade or borrowed DB_* vars.
- Existing intake table, append-only terminal routing journal, parameterized SQL,
  per-sender MySQL advisory locks; requires SELECT and INSERT only.
- Removed obsolete backend test-route service, endpoint and corresponding tests.
- Added proxy SQL unit tests and signed handler/store integration with fake SQL.
- Read-only server configuration check script and environment template.

## Handoff / verification

- Final checks passed: proxy 33/33 offline tests, backend 4 suites / 29 tests,
  Nest build, JavaScript syntax checks and diff whitespace checks.
- Local commit only; no database queries or live data mutations were run by this task.
- Backend WhatsApp source matches the pre-test-route b822f9e7 baseline; existing
  document intake, signature validation and prompt ownership remain intact.
- Driver installed independently inside proxy/ and recorded in its package lock.
- Documentation: Lychee proxy/backend feature docs and proxy database setup guide.
- Schema / production / permissions / accounting changes: none.
- External API / webhook configuration changes: none.
- Real Cloud Run network/SQL concurrency remains untested; configuration and
  eventual deployment require the user's next actions. No main integration.
