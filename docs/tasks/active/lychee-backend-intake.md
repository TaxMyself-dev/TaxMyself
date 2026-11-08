# Lychee backend intake

- Status: LOCAL_COMPLETE
- Branch/worktree: codex/whatsapp-integration / TaxMyself-whatsapp
- Base: aeb6b7a4
- Authorization: backend receiver and document intake; no messages, push or
  deployment. User separately approved preparing table/SQL only, not execution.

## Delivered

Signed raw-body POST /webhooks/lychee; durable event enqueue and event_id
dedup/conflict checks; lease-based worker and bounded retry; API media client
with host allowlist, public-address pinning, bounded size, no redirects and no
credential forwarding; normalized signup phone lookup with ambiguity rejection;
explicit business ownership and shared Drive importer; staged multi-business
bytes and quoted-reply correlation. No outbound messaging client exists.

Explicit SQL table is intentionally excluded from TypeORM synchronize. No schema
or database execution, credentials modification, external requests or deployment.

## Verification

- Focused service/regression checks: 4 suites, 45 tests passed.
- HTTP boundary: 1 suite, 4 tests passed with localhost execution permission.
- Initial HTTP attempt was blocked by sandbox EACCES; no code defect.
- Initial Jest default cache hit EPERM; isolated cache resolved it.
- Nest build passed. Proxy tests: 9 passed in preceding checkpoint.
- SQL/queue concurrency and real media/Drive behavior not verified against live
  systems. Tests use mocked SQL/media/Drive and local HTTP only.

## Remaining activation/manual checks

Review/apply SQL to explicitly authorized dev DB; configure secret, channel,
server API key, confirmed media hostname(s), receiver/worker flags and ngrok
destinations; deploy only with authorization; request signed provider event.
Actual business-question send and prompt mapping stay disabled/unimplemented
until sending is authorized. Retention/expiry policy and queue operations UI are
not included. See docs/features/whatsapp/lychee-backend.md.
