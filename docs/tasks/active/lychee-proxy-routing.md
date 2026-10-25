# Lychee proxy routing

- Status: LOCAL_COMPLETE
- Worktree: TaxMyself-whatsapp
- Branch: codex/whatsapp-integration
- Base: 94dc47e5
- Scope: implement approved single-destination proxy routing; no sending, push,
  deployment, schema changes or main integration.

Acceptance: enabled test senders route to HTTPS ngrok; other senders and test
mode off route to production. Raw body and signature remain intact. Reject
invalid signatures/channel/senders. No fallback on dev failure; propagate failure
for provider retries. Feature disabled by default.

Validation: `node --test proxy/lychee-webhook.test.js`: 9 passed, 0 failed.
`node --check proxy/server.js` and `git diff --check`: exit 0.
Tests mock downstream HTTP; no live provider, Drive, cloud or database calls.
Backend build not applicable: no backend code changed.

Delivery: proxy/lychee-webhook.js, proxy/lychee-webhook.test.js, proxy/server.js,
docs/features/whatsapp/lychee-proxy.md, and this task file.

Remaining: backend durable webhook receiver and full document intake; deployment
and live signature/ngrok verification. Existing development simulator cannot be
used as the receiver. Environment values were not read or modified.
