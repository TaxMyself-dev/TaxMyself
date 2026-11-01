# Lychee proxy: direct development database setup

Implementation is local only. No deployment, permission changes, production DB
access or outgoing messages. The former backend test-route endpoint is removed.

## Cloud Run configuration to prepare

On the **proxy** service, add these variables without replacing existing env vars:

| Variable | Value |
| --- | --- |
| `LYCHEE_DB_HOST` | Existing development MySQL host |
| `LYCHEE_DB_PORT` | Existing MySQL port, normally `3306` |
| `LYCHEE_DB_NAME` | Exactly `keepintax-dev` |
| `LYCHEE_DB_USER` | An existing account authorized for the dev routing table |
| `LYCHEE_DB_PASSWORD` | Its password, configured as a server secret |
| `LYCHEE_DB_SSL` | `true` by default; match the database's verified TLS configuration |
| `LYCHEE_DB_SSL_CA` | Optional PEM CA secret if server certificate needs a private CA |

TLS verifies the server certificate. There is no rejectUnauthorized=false option.
If the database intentionally uses a non-TLS connection, that requires an explicit
`LYCHEE_DB_SSL=false`; the adapter never downgrades automatically on TLS failure.
Actual passwords/certificates must not be committed. If using Secret Manager, use
an existing secret/service-account access arrangement; none was created here.

Template: `proxy/lychee-db.env.example`. This is documentation, not automatically
loaded by the proxy. Cloud Run needs the variables configured on the service.
The adapter uses its own prefix and will never borrow generic backend credentials
or fall through to another database. The name guard rejects production and copies.

Keep the existing `LYCHEE_WEBHOOK_ENABLED`, `LYCHEE_WEBHOOK_SECRET`,
`LYCHEE_CHANNEL_ID`, `LYCHEE_TEST_PHONES`, `LYCHEE_DEV_WEBHOOK_URL` and
`LYCHEE_PROD_WEBHOOK_URL`. Keep VPC connector/egress settings and all Feezback and
Cardcom variables intact. No `LYCHEE_TEST_MODE` or worker flag is required.

## Database access

The code needs **SELECT and INSERT only** on the existing
`keepintax-dev.lychee_intake_events` table. It does not need UPDATE, DELETE,
CREATE, ALTER, production DB access or a new table. MySQL GET_LOCK/RELEASE_LOCK
coordinate replicas on the same connection and do not change table schema.
This task does not create users, change grants or run migrations. If an existing
account lacks these rights, configuration remains blocked until separately handled.

Journal rows use `route:` hashes and terminal ROUTE_* statuses, separated from
actual intake IDs. Commands and decisions survive proxy restarts. Database failure
returns 502 for provider retry, with no implicit production fallback.

## Verification after configuration

From a runtime with the proxy environment configured, the read-only command
`node check-lychee-db.js` (inside proxy/) verifies connection, database name and
required table columns. It prints neither credentials nor raw errors. It does
not test INSERT permissions or prove Cloud Run reachability when run locally.

Then, after a separately authorized proxy deployment, keep the backend running
normally on port 3000 and ngrok forwarding to it. From an allowlisted phone:
send `בדיקות`, check `route.command` logs, send a captionless document, then
send `סיום בדיקות`. Commands are not sent to either backend. No WhatsApp
confirmation is sent. A local backend alone suffices for this dev upload flow.

Quoted business replies retain the existing ownership resolver; this adapter
does not change its production/dev lookup requirements. No questions are sent by
the current intake implementation.
