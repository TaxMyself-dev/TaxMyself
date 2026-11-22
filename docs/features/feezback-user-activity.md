# Feezback account-holder activity

Feezback support confirmed that its six-month inactivity timer resets only on
data API requests carrying `X-Psu-IP-Address`. Reading cached provider data
(`preventUpdate=true`) still counts; Feezback's own background refresh does
not count. Expiration and inactivity termination are separate mechanisms.

## Foreground request boundary

`FeezbackUserActivityInterceptor` runs after authentication on Feezback
controller routes, fresh-login handling and the transaction manual-sync/retry
routes. It creates an async-local context only when the verified actor is the
effective owner and the request is neither delegated nor admin view-as.
The context survives awaited work, retries, pagination and immediate
fire-and-forget login/manual sync descendants, without retaining an IP on a
user entity, singleton client or shared job record.

The HTTP client attaches the header only to GET consent/account/card paths
(including their transaction/balance paths) for that owner's primary or spouse
SUB at the configured Feezback API origin and path. Cross-owner targets,
external URLs, authentication/link calls and mutations omit it. Supplied request
options cannot inject a PSU header. No extra provider request is introduced
when a page reads only local data or a sync reuses completed/in-flight work.

Cron, enrollment recovery, webhook discovery and service calls outside the
explicit foreground context omit the header. Admin preparation/pulls and
accountant delegation do not claim that the customer is personally online.
Webhook routing/replay behavior is unchanged.

## Resolving the address

- Direct local requests use the socket address and ignore browser-supplied
  forwarding/PSU headers and body fields.
- In Cloud Run (`K_SERVICE` set), the default is one trusted ingress hop:
  select the rightmost X-Forwarded-For entry rather than a client-supplied prefix.
- `FEEZBACK_TRUSTED_PROXY_HOPS` overrides this specifically for Feezback
  attribution (integer 0-10). It does not change global Express proxy trust or
  authorization. Set it to the actual number of controlled proxy hops; for
  example, a local ngrok-only ingress requires an explicit value of 1. Do not
  enable forwarding trust on an ingress where direct/untrusted callers can
  supply the chosen position. Additional load balancers require verifying and
  configuring their exact chain before rollout.
- Missing/invalid addresses or trust settings omit the header. IPv4-mapped
  IPv6 is normalized to IPv4; ordinary IPv6 is accepted; zone IDs, lists and
  malformed IPs are rejected. No fallback substitutes the server's public IP.

The proxy preserves the explicit backend header through both forwarding paths
and never derives a PSU address from its own connection. Backend diagnostics
and proxy header/cURL logs redact its value. The IP is not stored in the DB.

## Verification and rollout

Focused Jest tests cover IP trust, actor/target separation, concurrent owners,
ordinary background calls, retries, V2 pagination and RxJS/async descendants.
Local HTTP tests exercise the real permission/login/manual/retry/admin
controllers against a loopback fake Feezback server. Proxy tests exercise the
actual middleware against a loopback upstream and check header omission and
log redaction. They make no calls to Feezback, databases or deployed services.

Backend and proxy changes require their normal separately approved release;
local tests/commits do not update a deployed proxy. The feature does not
restore an already-terminated permission; the customer must reconnect.
