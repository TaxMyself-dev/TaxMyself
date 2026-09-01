# Mailgun inbound document spike

## Goal

Prove the smallest real path before building the full product:

`email -> Mailgun EU -> signed route webhook -> DocumentImportService -> Drive inbox`

The spike deliberately supports one configured recipient and one existing
business. It does not add database tables, sender management, a queue, OCR
triggering, or frontend UI. Those are only approved after the end-to-end test.

## Mailgun account setup

1. Create the account under a Keepintax-owned email address, not a developer's
   personal address.
2. Select the EU region for the receiving domain.
3. Start with the lowest plan whose checkout explicitly includes one inbound
   route. Mailgun's public pricing currently shows one inbound route on the
   Free plan; verify this in the account before entering payment details.
4. Add `docs-dev.keepintax.co.il` as the spike receiving domain.
5. Add the MX/TXT records shown by Mailgun to DNS. Do not change the MX records
   of `keepintax.co.il` itself.
6. Enable spam filtering for the receiving domain.
7. Create a high-priority route that matches only the spike address and uses:

   ```text
   store(notify="https://<dev-api-host>/webhooks/mailgun/inbound")
   stop()
   ```

8. Copy the account's HTTP webhook signing key. This is not the domain sending
   key and not an SMTP password.

Mailgun temporarily stores messages and includes a `message-url` in the route
notification. The spike consumes the attachments included in the signed
multipart notification; the production worker will retain the URL so it can
retrieve a message after transient failures.

## Backend configuration

Configure these only in the development runtime secret store:

```text
MAILGUN_INBOUND_SPIKE_ENABLED=true
MAILGUN_INBOUND_SIGNING_KEY=<Mailgun HTTP webhook signing key>
MAILGUN_INBOUND_SPIKE_RECIPIENT=spike@docs-dev.keepintax.co.il
MAILGUN_INBOUND_SPIKE_FIREBASE_ID=<existing dev user firebaseId>
MAILGUN_INBOUND_SPIKE_BUSINESS_NUMBER=<that user's existing business number>
MAILGUN_INBOUND_SIGNATURE_MAX_AGE_SECONDS=900
```

When `MAILGUN_INBOUND_SPIKE_ENABLED` is not exactly `true`, the endpoint returns 404. Do not commit any of these values.

## Acceptance test

1. Send one PDF invoice from Gmail to the configured spike address.
2. Confirm Mailgun marks the route request successful.
3. Confirm the API log contains one aggregate `Mailgun spike accepted` line.
4. Confirm the file exists in the target business's Drive `inbox/` folder.
5. Confirm `imported_documents.source` is `EMAIL_FORWARDING`.
6. Send the same file again and confirm no second Drive file is created.
7. Send a JPG and a PNG and confirm both import.
8. Send a TXT attachment and confirm it is ignored.
9. Disable the feature flag and confirm the endpoint returns 404.

## Go/no-go checkpoint

Proceed to the full data model and durable worker only after recording:

- the plan actually charged by Mailgun and any trial end date;
- inbound message/route counters visible in billing;
- payload field names and attachment MIME values observed in practice;
- maximum attachment behavior;
- Mailgun retry behavior after a deliberate HTTP 500;
- time from SMTP acceptance to the file appearing in Drive;
- whether `store(notify=...)` retains a retrievable message for the advertised
  account retention window.
