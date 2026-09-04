# Dedicated inbound email addresses

## Product behavior

- Every owned business gets one stable, friendly Keepintax address.
- An ASCII business name is claimed automatically when available. For Hebrew
  names or global name collisions, the owner chooses a unique English alias.
- Addresses contain neither the Firebase id nor business number. Reserved
  operational names cannot be claimed, and released/disabled aliases remain
  reserved so old mail is never routed to a different business.
- Sending PDF/JPG/PNG attachments to that address imports them immediately
  through Mailgun into the business Drive inbox and schedules OCR in Cloud
  Tasks. OCR no longer waits for the user to open a report.
- `imported_documents.source` is `EMAIL_FORWARDING`.
- When the Drive inbox OCR pipeline creates `extracted_document` rows, their
  archive `source` is `EMAIL`, rendered as `מייל` in the frontend.
- Connected Gmail imports are also displayed as `מייל`, because Gmail is the
  original intake channel even though Drive is the shared transport/storage.
- Content-hash dedup remains scoped to user + business.

Addresses are allocated lazily by the authenticated endpoint:

```text
GET /inbound-email/me/addresses
```

The settings page calls it when the permissions/accounts tab opens. It offers
a one-time choice for businesses without an address and for legacy `d-...`
addresses created by the spike. Once a friendly address is saved it is
permanent and the UI offers only a copy action.

Owners create an address, or replace a legacy generated address once, through:

```text
PUT /inbound-email/me/addresses/:businessNumber
{ "localPart": "porto-pivo" }
```

Aliases are global, case-insensitive and accept 3-50 lowercase English
letters, digits and hyphens. A collision returns HTTP 409 so the UI can ask
the owner for another friendly variation; the backend never appends a random
suffix. A later attempt to change an established friendly address also
returns HTTP 409.

## Mailgun route

The receiving domain and route must be in the same Mailgun region. For dev,
both are EU.

Use one route for the whole receiving subdomain:

```text
expression: match_recipient(".*@docs-dev.keepintax.co.il")
action:     forward("https://<api-host>/webhooks/mailgun/inbound")
action:     stop()
priority:   0
```

Use `forward(URL)`, not `store(notify=URL)`: the controller consumes Mailgun's
signed multipart POST and its attachment bodies directly. Unknown or inactive
opaque recipients return HTTP 406, which tells Mailgun not to retry them.

## Environment

```text
MAILGUN_INBOUND_ENABLED=true
MAILGUN_INBOUND_DOMAIN=docs-dev.keepintax.co.il
MAILGUN_INBOUND_SIGNING_KEY=<account HTTP webhook signing key>
MAILGUN_INBOUND_SIGNATURE_MAX_AGE_SECONDS=900
```

The old `MAILGUN_INBOUND_SPIKE_*` variables remain as temporary local
compatibility for `spike@...`; production recipient resolution is DB-backed.

## Schema/deployment

Before enabling the feature in production, run:

```text
backend/scripts/migrations/2026-09-02_inbound-email-addresses.sql
```

Then configure the production receiving domain (`docs.keepintax.co.il`), its
EU MX records, the catch-all domain route, and the production variables above
on the backend Cloud Run service.

## Report-triggered background OCR

Mailgun only persists accepted attachments in the business Drive inbox. When
the VAT or P&L report is opened, the lightweight preview check returns the
number of waiting inbox files. The browser then starts
`POST /documents/me/process-inbox` as a separate request and continues loading
the report without waiting for OCR.

The processing request remains open until the inbox pass finishes, so Cloud Run
continues treating it as active work. The report page shows a persistent status
banner, polls when another request already owns the work, and refreshes after
completion. Failed files remain in the inbox and can be retried from the banner
or on the next report visit.

Processing is single-flight per Firebase user and business. A MySQL advisory
lock prevents separate Cloud Run instances from processing the same inbox at
the same time. The lock is tied to a dedicated database connection and is
released automatically if that connection disappears. No Cloud Tasks resource
or OCR queue environment variables are required.

## Delivery semantics

The webhook stores each attachment synchronously and returns 200 after the
shared import pipeline has imported it or identified a duplicate. Transient
Drive/database failures return 500 so Mailgun retries; content-hash dedup keeps
those retries idempotent.

The durable Drive inbox is the retry source of truth. Successful files move to
the processed folder; failed files remain in the inbox for the next user-driven
attempt. No additional database migration is required for this processing flow.
