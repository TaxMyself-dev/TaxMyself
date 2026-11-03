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

## Authorized local main integration — 2026-11-02

User separately approved main integration without deployment or push. Main was
clean at b9717c61 and fast-forwarded to 1fed0a3d without conflicts. Only the
13 reviewed Lychee backend/documentation files changed; proxy, Feezback and
Cardcom code remained unchanged. All 17 suites / 240 mocked tests passed again
on integrated main. Backend build result is recorded below.

Integrated-main backend build: npm run build passed. No live messages, data changes, cloud changes, deployment or GitHub push.
