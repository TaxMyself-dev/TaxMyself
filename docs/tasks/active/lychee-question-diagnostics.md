# Business-question delivery diagnostics

- Worktree: TaxMyself-whatsapp, codex/whatsapp-integration.
- Scope: local diagnostics only. No sending/requeue, DB changes, deployment or push.
- HTTP failures retain only sanitized status, selected scalar provider code/message,
  failure kind and elapsed time. Axios config, headers, request bodies, raw errors
  and arbitrary response fields are excluded. Configured Lychee credentials,
  request values, URLs, email addresses, phone-like numbers and opaque tokens
  are redacted; provider text is bounded to 400 characters.
- Missing receipt after HTTP success is distinguished from HTTP/network failure.
- Existing quarantine and no-resend behavior remains unchanged. Historical
  PROMPT_UNKNOWN records are untouched; their original errors cannot be recovered
  from this change. Diagnostics apply only to future authorized attempts.
- Verification: mocked transport, diagnostic redaction and outbox service tests;
  backend compilation. No live HTTP or database calls during implementation.
