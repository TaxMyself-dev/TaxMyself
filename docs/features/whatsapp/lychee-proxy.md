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

For each unquoted allowlisted event the proxy directly reads/writes the existing
`keepintax-dev.lychee_intake_events` table through its own mysql2 connection pool.
No backend routing endpoint, backend allowlist, new table or schema is required.
Use [the server setup guide](lychee-proxy-database.md) for explicit `LYCHEE_DB_*`
settings. Generic backend `DB_*` variables are never inherited. Any database name
other than exactly `keepintax-dev` is rejected before connection.
The decision remains stable on delivery retries, even after ending tests. The
sender and channel scope is isolated; restarting/scaling the proxy preserves mode.
Development SQL is the shared routing authority across proxy replicas.
Commands are acknowledged only after durable storage and are not forwarded to
either document receiver. No WhatsApp confirmation message is sent. Operator logs
include `route.command`/`route.resolve`; verify activation there before testing.
The stop command therefore works even while ngrok is unavailable. If the routing
authority fails, allowlisted unquoted events return 502 without forwarding or
falling back to prod. Missing/invalid event timestamps are rejected before SQL access.
Routing journal entries use terminal `ROUTE_*` statuses and hashed `route:` IDs;
they are never claimed by the document worker. A per-sender/channel/database
advisory lock serializes writes; document retries retain their stored destination.
Delayed commands use provider event time; conflicting same-time commands fail closed.
The driver is loaded lazily, so missing DB configuration does not disable Feezback,
Cardcom or non-test-sender forwarding. SQL errors are logged without credentials,
connection strings, query parameters or raw exception messages.
Null, missing or blank sender_phone falls back to contact_phone; malformed or
conflicting nonempty sender phones are rejected. Signed bytes remain unchanged.
Never mirror or fall back to prod after a dev failure.
Quoted replies take precedence over the current test mode. For allowlisted senders the proxy
queries development prompt ownership directly in SQL first, scoped by channel,
sender and quoted question ID, including completed documents. A unique dev owner
routes to dev without a production request. Unknown replies in active test mode
return 409 without a production request. After ending tests (or before starting),
an unknown dev question is checked only at the production receiver's
`<receiver-url>/reply-owner` with the unchanged signed event. This endpoint only reads persistent prompt mappings;
it never enqueues, downloads media or processes the event. Exactly one owner is
required, then the event is forwarded only to that receiver. Unlisted senders
can resolve production ownership only. Unknown ownership returns 409; failed
lookups or ambiguous development mappings return 502 for retry, with no environment fallback.
Dev SQL must be reachable to resolve test senders' quoted replies. A known dev
question does not require a production backend or even an ngrok ownership probe;
ngrok is used only to forward the actual reply. No quoted reply is routed solely
by its button text or arrival order.
Other unquoted messages follow the sender's persisted mode, independently of other senders.
Configuration is read on process startup; changes require a proxy restart/deploy.
For standalone commands and captionless dev uploads, configure and later deploy
only this proxy, and run the normal local backend via ngrok. Testing quoted dev
business replies also uses only dev SQL and the local receiver after this revision
is deployed. This checkpoint does not enable outbound business questions.

The proxy follows no redirects, forwards no API credentials, and logs no payloads.
It waits up to 10 seconds for downstream acceptance. Any non-2xx or network
failure yields 502 for provider retry. Backends MUST authenticate the signature
and durably store/deduplicate `event_id` before acknowledging. This proxy is not
a durable queue. Lychee retry limits and subscription suspension still apply.
Do not enable until the corresponding backend receivers are implemented.

The existing development simulator is NOT this receiver and cannot consume this
payload. See `lychee-backend.md` for the receiver, required SQL (executed on dev
only), automatic document worker and remaining activation requirements.

Run focused offline tests: `node --test proxy/lychee-webhook.test.js proxy/lychee-routing-store.test.js`.
The deployed proxy hostname/configuration have not been verified; after approval
and deployment, give Lychee the verified hostname plus `/lychee/webhook`.
