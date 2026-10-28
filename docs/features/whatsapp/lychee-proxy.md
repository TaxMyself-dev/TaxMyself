# Lychee webhook proxy

Local implementation only; no deployment or outbound WhatsApp messages.

The proxy exposes POST `/lychee/webhook` only with `LYCHEE_WEBHOOK_ENABLED=true`.
It is registered before the existing JSON parser, verifies HMAC-SHA256 against
the original bytes, validates the configured channel and matching sender/contact
phones, and forwards the exact bytes and signature to exactly one backend.

Server environment configuration (never commit actual values):

- `LYCHEE_WEBHOOK_SECRET`: webhook signing secret supplied by Lychee.
- `LYCHEE_CHANNEL_ID`: Keepintax channel identifier.
- `LYCHEE_PROD_WEBHOOK_URL`: full HTTPS production receiver endpoint.
- `LYCHEE_TEST_MODE`: legacy variable; no longer controls routing.
- `LYCHEE_TEST_PHONES`: comma-separated test senders; Israeli local mobile
  numbers normalize to international format. Only these senders can select dev.
- `LYCHEE_DEV_WEBHOOK_URL`: full HTTPS ngrok receiver endpoint, required with
  a nonempty test-phone list. Update when the ngrok hostname changes.

Listed senders go to dev ONLY when `text` contains the standalone token `#dev`
(case insensitive, whitespace-delimited). Without it, even test senders go to
prod. Unlisted senders always go to prod, including when they write `#dev`.
Null, missing or blank sender_phone falls back to contact_phone; malformed or
conflicting nonempty sender phones are rejected. Signed bytes remain unchanged.
Never mirror or fall back to prod after a dev failure.
Quoted follow-up replies without `#dev` still follow this rule; durable reply
ownership across environments is not implemented and remains required before
enabling business-selection prompts. Do not assume a dev conversation is sticky.
Configuration is read on process startup; changes require a proxy restart/deploy.
Finish pending business selections before switching a sender's environment.

The proxy follows no redirects, forwards no API credentials, and logs no payloads.
It waits up to 10 seconds for downstream acceptance. Any non-2xx or network
failure yields 502 for provider retry. Backends MUST authenticate the signature
and durably store/deduplicate `event_id` before acknowledging. This proxy is not
a durable queue. Lychee retry limits and subscription suspension still apply.
Do not enable until the corresponding backend receivers are implemented.

The existing development simulator is NOT this receiver and cannot consume this
payload. See `lychee-backend.md` for the new receiver, required SQL (prepared but
not executed), disabled worker and remaining activation requirements.

Run focused offline tests: `node --test proxy/lychee-webhook.test.js`.
The deployed proxy hostname/configuration have not been verified; after approval
and deployment, give Lychee the verified hostname plus `/lychee/webhook`.
