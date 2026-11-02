# Production-capable Lychee delivery

Approved scope: remove the dev-only outbound restriction, preserve environment,
channel, account and business isolation and durable dedup; mocked tests only.
No new activation flag, live messages/data/credentials access, cloud settings,
schema execution, deployment, main integration or GitHub push.

- Continue existing WhatsApp worktree from local main b9717c61 (tree unchanged by
  that fast-forward). No new worktree or environment file changes.
- Rename the transport to ConfiguredLycheeTransport and bind both question and
  result tokens to it. Valid deployment identities: development/keepintax-dev and
  production/keepintax-prod, agreeing with env, configured DS and actual connection.
- Reject copies/backups, crossed/missing configurations and config drift before
  outbound HTTP. No role/ownership, retry, receipt, lease or vendor API contract changes.
- Preserve exact legacy dev idempotency keys; production uses a different stable
  namespace with database identity. No provider exactly-once guarantee is inferred.
- Production-profile integration tests use fake SQL and fully mocked axios to
  exercise persisted question receipts and success/failure notification completion,
  plus wrong ownership rejection. No real production connection is constructed.
- Deployment schema/environment/platform requirements documented in
  docs/features/whatsapp/lychee-production.md. No new schema for this code change;
  initial intake table may still need separately authorized production creation.

Verification: all 17 WhatsApp suites / 240 mocked tests passed, including
production-profile question and result delivery. Focused verification also passed
167 tests before the complete regression run. Backend build and diff check
passed. No live message, database, environment or cloud changes were performed.
