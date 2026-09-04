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

DOCUMENT_OCR_QUEUE_ENABLED=true
DOCUMENT_OCR_QUEUE_PROJECT_ID=<google-cloud-project-id>
DOCUMENT_OCR_QUEUE_LOCATION=me-west1
DOCUMENT_OCR_QUEUE_NAME=document-ocr
DOCUMENT_OCR_QUEUE_TARGET_URL=https://<backend-run-app-host>/internal/tasks/document-ocr
DOCUMENT_OCR_QUEUE_AUDIENCE=https://<backend-run-app-host>
DOCUMENT_OCR_QUEUE_SERVICE_ACCOUNT_EMAIL=document-ocr-invoker@<project-id>.iam.gserviceaccount.com
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

## Background OCR queue

Create a Cloud Tasks queue named `document-ocr` in the backend's Cloud Run
region. Start with **one concurrent dispatch**: each task scans the whole
business inbox, and serial dispatch avoids two workers OCRing the same Drive
file at once. Configure retries for transient Claude, Drive, or database
failures.

Use a dedicated service account such as `document-ocr-invoker` for the task's
OIDC identity. The required IAM edges are:

- the task identity has `roles/run.invoker` on the backend Cloud Run service;
- the backend runtime service account has `roles/cloudtasks.enqueuer`;
- the backend runtime service account may act as the task identity
  (`roles/iam.serviceAccountUser` on `document-ocr-invoker`).

Cloud Tasks calls:

```text
POST /internal/tasks/document-ocr
Authorization: Bearer <Google-issued OIDC identity token>
{ "firebaseId": "...", "businessNumber": "..." }
```

The application verifies both the token audience and the exact service-account
email before processing. Use the stable Cloud Run `run.app` origin as the OIDC
audience, even if Mailgun calls the API through another public/custom URL.

`DOCUMENT_OCR_QUEUE_ENABLED` is intentionally off unless its value is exactly
`true`. With it off, local report flows retain synchronous inbox processing;
this keeps local development usable without Google Cloud credentials.

## Delivery semantics

The webhook stores each attachment synchronously and returns 200 only after the
shared import pipeline has imported it (or identified a duplicate) **and** the
business OCR task has been accepted by Cloud Tasks. Transient Drive/DB/queue
failures return 500 so Mailgun retries. Content-hash dedup plus deterministic
Cloud Task names make retries idempotent.

The worker scans the existing durable Drive inbox and calls the same
`DocumentsService.processInboxForUser` pipeline as before. A failed OCR returns
500 to Cloud Tasks so it can retry; successful files are still moved to the
processed folder. No database migration is required for the queue slice.
