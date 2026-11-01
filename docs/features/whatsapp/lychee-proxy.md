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

Listed senders start in prod. An unquoted, standalone text message `בדיקות`
enables dev for that sender; `סיום בדיקות` restores prod. Leading/trailing and
repeated whitespace is ignored. The mode lasts until the stop command; no timer
is applied. Documents need no caption. Captions and longer sentences never toggle
the mode. The old `#dev` caption no longer selects dev. Unlisted senders always
go to prod and cannot change routing state, even if they send either command.

For each unquoted allowlisted event the proxy calls the stable production
receiver's `/test-route` subpath with the original signed bytes. The backend must
also have the same `LYCHEE_TEST_PHONES` allowlist. It verifies the signature,
channel and sender again, and stores mode commands and per-event routing decisions
in the existing SQL table. No in-memory proxy state or new database table is used.
The decision remains stable on delivery retries, even after ending tests. The
sender and channel scope is isolated; restarting/scaling the proxy preserves mode.
The production receiver is the single routing authority, even for dev documents.
Commands are acknowledged only after durable storage and are not forwarded to
either document receiver. No WhatsApp confirmation message is sent. Operator logs
include `route.command`/`route.resolve`; verify activation there before testing.
The stop command therefore works even while ngrok is unavailable. If the routing
authority fails, allowlisted unquoted events return 502 without forwarding or
falling back to prod. Missing/invalid event timestamps are rejected by the authority.
Null, missing or blank sender_phone falls back to contact_phone; malformed or
conflicting nonempty sender phones are rejected. Signed bytes remain unchanged.
Never mirror or fall back to prod after a dev failure.
Quoted replies take precedence over the current test mode. For allowlisted senders the proxy
queries both configured receivers at `<receiver-url>/reply-owner` with the
unchanged signed event. This endpoint only reads persistent prompt mappings;
it never enqueues, downloads media or processes the event. Exactly one owner is
required, then the event is forwarded only to that receiver. Unlisted senders
can resolve production ownership only. Zero/multiple owners return 409; failed
lookups return 502 for retry, with no environment fallback.
For test senders, ngrok must be reachable even to disambiguate a production
quoted reply. Both backends must expose the ownership endpoint before deploying
this proxy revision. No quoted reply is routed solely by its text or arrival order.
Other unquoted messages follow the sender's persisted mode, independently of other senders.
Configuration is read on process startup; changes require a proxy restart/deploy.
Deploy the backend `/test-route` implementation and configure its allowlist before
deploying this proxy revision. The authoritative backend must already have the
intake table; provisioning production storage requires separate authorization.

The proxy follows no redirects, forwards no API credentials, and logs no payloads.
It waits up to 10 seconds for downstream acceptance. Any non-2xx or network
failure yields 502 for provider retry. Backends MUST authenticate the signature
and durably store/deduplicate `event_id` before acknowledging. This proxy is not
a durable queue. Lychee retry limits and subscription suspension still apply.
Do not enable until the corresponding backend receivers are implemented.

The existing development simulator is NOT this receiver and cannot consume this
payload. See `lychee-backend.md` for the receiver, required SQL (executed on dev
only), automatic document worker and remaining activation requirements.

Run focused offline tests: `node --test proxy/lychee-webhook.test.js`.
The deployed proxy hostname/configuration have not been verified; after approval
and deployment, give Lychee the verified hostname plus `/lychee/webhook`.
