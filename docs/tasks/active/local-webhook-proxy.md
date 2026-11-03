# Local webhook routing for concurrent worktrees

Purpose: replace two pooled ngrok endpoints sharing one public domain with one
endpoint to a loopback-only local router. Keep the WhatsApp backend on 3000 and
Feezback backend on 3001. No cloud proxy, credentials, backend or ngrok configuration
files are changed. Do not start/stop the user's backends or tunnels automatically.

## Run

Keep both backends running. Stop the existing ngrok agent serving backend3000 and
backend3001 (Ctrl+C in its terminal) so it no longer shares the public domain.
Leave the backend terminals running.

In a separate PowerShell terminal:

```powershell
node "C:\Users\user\Keepintax\TaxMyself-whatsapp\backend\scripts\local-webhook-proxy.js"
```

In another PowerShell terminal, launch one tunnel with the installed ngrok binary:

```powershell
& "C:\Users\user\AppData\Roaming\npm\node_modules\ngrok\bin\ngrok.exe" http 127.0.0.1:3002 --url=https://margeret-guttiform-overfondly.ngrok-free.dev
```

Use the executable explicitly: this machine's `ngrok` PowerShell npm shim did not
display help, while the installed `ngrok.exe http --help` verified this URL flag.
Do not also run `ngrok start --all` or old tunnels to 3000/3001 at this domain.
The public domain and cloud webhook URLs remain unchanged.

Optional local-only health check, which does not call either backend:

```powershell
Invoke-RestMethod http://127.0.0.1:3002/_local-webhook-proxy/health
```

## Routing and transport

- POST /webhooks/lychee and POST /webhooks/lychee/reply-owner -> 127.0.0.1:3000.
- GET/POST /feezback/webhook -> 127.0.0.1:3001 (includes GET verification).
- One optional trailing slash and query strings are supported. Unknown routes
  and methods return 404; no generic forwarding of the backend's other APIs.
- Built-in Node HTTP only: no install/build, dotenv, database, API credentials,
  body parsing, signature recalculation, decompression or cloud connections.
- Stream body bytes and preserve end-to-end headers, method, path/query and
  upstream response status/body/headers. Rewrite only Host to the selected local
  destination and remove HTTP hop-by-hop headers, including Connection tokens.
- No retries, redirects, replay or failover: a stopped backend gives 502, and an
  idle backend request times out after 30 seconds with 504. Never report a false
  successful receipt or send a webhook to the other environment on failure.
- Log only static route name, local target port, method, status and durationMs.
  durationMs includes the selected local backend round trip, not only router overhead.
  Never log bodies, query strings, headers, credentials, names or phone numbers.
- Bind CLI listener to 127.0.0.1:3002. Ctrl+C closes it. To return to a single
  backend, stop this proxy/tunnel and launch one ngrok HTTP tunnel directly to
  127.0.0.1:3000 at the same URL.

## Verification and limitations

`node --test backend/scripts/local-webhook-proxy.test.js`: six tests passed using
fake loopback HTTP backends on ephemeral ports only. Tests cover repeatable routing,
exact Unicode/whitespace bytes and HMAC/secret headers, response transparency,
GET verification, health isolation, unknown routes, unavailable backends, timeout,
redirect passthrough, no retries/failover and safe logs. Local socket access needed
sandbox escalation; there were no calls to the real 3000/3001 backends or providers.
No application build is required for these standalone JavaScript files.

This fixes local routing only. The inherited incorrect LYCHEE_API_KEY diagnosed
in the WhatsApp process is a separate issue and is not changed here. No tunnel or
real webhook was launched during verification. No schema/auth/accounting/cloud
changes, deployment, main integration or GitHub push.
