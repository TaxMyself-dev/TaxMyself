# Lychee production deployment preparation

Code supports normal development and production settings without a new activation
flag. This document does not authorize accessing a live database, changing cloud
configuration, executing DDL, sending messages or deploying. Verification is mocked.

## Delivery identity and isolation

Both saved profile fields User.phone and User.spousePhone can identify the same
intake account. The existing spouse phone is edited in account spouse settings;
no new schema/env is needed. Both phones access the same owned business list.
Multiple businesses always require a new document-specific selection. Questions
and results go to the original sender. Cross-account phone collisions are
rejected, including primary/spouse collisions. Removing a phone blocks later
account-scoped delivery to it; quoting another phone's question is not allowed.

Both LycheePromptTransport and LycheeNotificationTransport bind to
ConfiguredLycheeTransport. It requires all three database identities to agree:
DB_DATABASE from the environment, DataSource.options.database and the actual
SELECT DATABASE() result immediately before HTTP sending.

| NODE_ENV | DB_DATABASE / configured / actual database |
| --- | --- |
| development | keepintax-dev |
| production | keepintax-prod |

Unknown/test/unset runtimes, production copies/backups and crossed pairs never
send. The request channel must equal LYCHEE_CHANNEL_ID and the quote must exist.
Configuration changes during database verification cancel that attempt before
HTTP. These are existing deployment settings, not new worker switches.

Question/current-account/business snapshot checks and notification ownership checks
remain in their services. Durable leases, atomic drafts, source-document mapping,
waId extraction/message-get fallback, unknown-send quarantine and receipt-only
recovery remain unchanged. Production keys have a separate stable idempotency
namespace including the production database. Existing development keys are
unchanged, so rolling out this code does not change keys for pending dev drafts.
No HTTP retry or dev/prod fallback is added. Provider acceptance is not delivery.

## Database schema

The only Lychee-specific table is lychee_intake_events, using the existing DDL:
[2026-10-25_lychee_intake.sql](../../../backend/scripts/migrations/2026-10-25_lychee_intake.sql).
If absent, a separately authorized database administrator must create it in the
production database before receiver deployment. If present, compare its columns
and indexes to that script; do not run CREATE over an existing table.

This production transport change adds no columns, tables, enums or migrations.
All question/result/reminder states use existing VARCHAR/JSON queue fields.
The shared imported_documents ledger and API_IMPORT source are existing pipeline
prerequisites, not new schema changes here. Never register the queue in TypeORM
synchronize. The development schema helper intentionally refuses production and
must not be used to apply production DDL. Backend runtime needs SELECT/INSERT/UPDATE
on its own intake table and its existing importer/business permissions.

## Backend service settings

Keep the actual production DB connection credentials; NODE_ENV=production and
DB_DATABASE=keepintax-prod must agree with the actual connection. Keep
DISABLE_SYNCHRONIZE=true. Add/configure these existing secrets/settings:

```dotenv
LYCHEE_WEBHOOK_SECRET=<same webhook signing secret as the proxy>
LYCHEE_CHANNEL_ID=73971d88-8e11-4f58-958c-7472129063e7
LYCHEE_API_KEY=<API key permitted to read media and send messages>
LYCHEE_MEDIA_HOSTS=shxsdijepxzybjjhxxjz.supabase.co
```

Preserve production Google settings: GOOGLE_SERVICE_ACCOUNT_JSON,
GOOGLE_DRIVE_ROOT_FOLDER_ID, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
GOOGLE_DRIVE_SYSTEM_REFRESH_TOKEN. Verify the intended root and access for folder
creation and file uploads; do not substitute dev credentials or a dev root as a
side effect of copying Lychee settings. GOOGLE_DRIVE_SYSTEM_ACCOUNT_EMAIL is only
a documentation label, not the authentication used by this adapter.

No LYCHEE_WORKER_ENABLED or LYCHEE_TEST_MODE. LYCHEE_TEST_PHONES belongs to the
proxy's test routing, not a new backend requirement. Existing global
DISABLE_SCHEDULED_TASKS must not be true for the in-process workers to run.

On Cloud Run, this architecture processes durable queues after webhook ACKs.
For continuous polling/recovery, provision instance-based billing (CPU outside
requests) and at least one minimum instance, or use a separately designed durable
worker architecture. These are cloud resource settings, not Lychee activation
flags, and are not changed by this task. Source: [Cloud Run CPU allocation and
background execution](https://docs.cloud.google.com/run/docs/configuring/billing-settings).
CPU allocation and warm instances do not prevent termination; SQL leases still
provide restart recovery and may delay a new attempt for up to five minutes.

## Proxy settings

Preserve existing Feezback/Cardcom and Lychee configuration. Check these existing
Lychee values rather than replacing the service's complete environment:

```dotenv
LYCHEE_WEBHOOK_ENABLED=true
LYCHEE_WEBHOOK_SECRET=<same signing secret as the receiver>
LYCHEE_CHANNEL_ID=73971d88-8e11-4f58-958c-7472129063e7
LYCHEE_PROD_WEBHOOK_URL=https://<production-backend>/webhooks/lychee
LYCHEE_DEV_WEBHOOK_URL=https://<fixed-ngrok-domain>/webhooks/lychee
LYCHEE_TEST_PHONES=<existing approved testers>
```

Existing LYCHEE_DB_HOST/PORT/NAME/USER/PASSWORD/SSL/SSL_CA continue to serve dev
routing authority: LYCHEE_DB_NAME stays keepintax-dev. That limited proxy account
needs SELECT/INSERT on the dev intake table, not production DB access. Production
question ownership is checked through the signed production reply-owner endpoint.
No API sending key is needed on the proxy. The vendor webhook URL stays on the
cloud proxy's /lychee/webhook; its forward target ends in /webhooks/lychee.

## Release verification

Intake rejection notices: duplicate/missing phone-account mappings, changed owner,
unsupported message media and rejected quoted business choices now stage a fixed
explanation atomically with the terminal state. These phone-only notices contain
no account/business identity; sender/channel/quote/parent/hash/runtime validation
still applies. Normal text without media or a quote is ignored. Account-free
final processing failures can also notify the verified sender without choosing
an account. Existing completed rows are not backfilled. No schema/env changes.
Invalid signatures/phones cannot receive a safe reply; provider outages, UNKNOWN
send outcomes and CPU throttling can still delay/prevent notification delivery.
Question-send cancellation/unknown outcomes remain operational review cases.

Mock coverage must exercise real service outboxes + guarded transport under both
runtime profiles, production buttons and success/failure notifications, current
ownership rejection, actual-database mismatch, copies/crossed configurations,
configuration drift, legacy dev idempotency compatibility, production separation
and no repeat sending. No existing UNKNOWN rows are reset or replayed here.

After a separately authorized release: schema before backend, platform/secrets
checked, then user-authorized end-to-end verification. Existing pending rows may
start processing when a correctly configured instance starts. No historical
completed rows without drafts are backfilled. No success SLA or real delivery is
claimed solely from mocked tests; delivery-failure callbacks remain separate work.
