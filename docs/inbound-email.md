# Dedicated inbound email addresses

## Product behavior

- Every owned business gets one stable, opaque Keepintax address.
- The address does not contain the Firebase id or business number.
- Sending PDF/JPG/PNG attachments to that address imports them immediately
  through Mailgun into the business Drive inbox.
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

The settings page calls it when the permissions/accounts tab opens and offers
a copy button for each business.

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
EU MX records, the catch-all domain route, and the three production variables
above on the backend Cloud Run service.

## Delivery semantics

The webhook processes each attachment synchronously and returns 200 only after
the shared import pipeline has either imported it or identified a duplicate.
Transient Drive/DB failures return 500 so Mailgun retries. The content hash and
unique database index make retries idempotent.
