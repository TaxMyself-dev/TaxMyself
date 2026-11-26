# Document email queue DEV activation - 2026-11-26

Elazar explicitly requested activating the prepared recipient-email queue. This
supersedes the earlier SQL-preparation-only authorization for keepintax-dev
activation only. No production access, cloud configuration or deployment.

## Applied and active

Verified DB_DATABASE and SELECT DATABASE() both equal keepintax-dev. Applied only
backend/scripts/migrations/2026-11-25_document-email-outbox.sql: one additive
CREATE TABLE IF NOT EXISTS document_email_outbox, no changes to other schemas or
tables except three deliberately created outbox test jobs. The table was absent
or empty before tests. No automatic synchronize or boot seeds enabled.

The isolated ignored local launcher now sets DOCUMENT_EMAIL_QUEUE_ENABLED=true,
DOCUMENT_EMAIL_QUEUE_RUNNER=cron on backend port 3004. Other scheduled tasks stay
disabled. Because that local profile disables Nest cron globally, its private
launcher invokes only the real DocumentEmailQueue.tick every ten seconds and
once at module initialization. Existing post-commit kick remains active. No new
product timer, public endpoint or committed environment/credential was added.
Runtime emitted dev_document_email_queue_active; HTTP health returned 200 and
startup stderr was empty. A first attempted app.listen wrapper did not attach
the timer; the missing readiness marker was inspected and the DEV-only hook was
moved to the queue module lifecycle before reporting successful activation.

This enables real delivery for future selected recipient-email issuance on this
local DEV instance, using its existing mail configuration. Verification itself
sent ZERO emails. Production/Cloud Run remains unmodified and still requires
separate schema application, scheduler configuration, authenticated invocation
and deployment. The ignored local launcher is not part of the remote source.

## Database/behavior checks

Used the actual built DocumentEmailQueue class with two real MySQL connections
and existing authorized synthetic DEV documents. Attachment acquisition and
mail delivery were fake transports, guarded to queue-test@example.invalid, so
no provider request or external email occurred.

- Enqueue participates in caller transaction; rollback leaves no persisted job.
- Enqueue/commit alone does not send.
- A new queue instance with empty attachment cache processes a persisted job.
- Two workers competing for one job produce one claim/delivery, attempts=1.
- Missing document/file match cancels without delivery.
- Pre-send attachment failure schedules RETRY.
- All three test jobs were finally marked CANCELLED with an explicit DEV-test
  marker; no PENDING/RETRY/SENDING test work remains. Test rows were retained,
  not deleted. No existing financial document was changed by these checks.

These prove real SQL/claim/transaction behavior with fake attachment/mail, not
actual Brevo acceptance, recipient inbox delivery or live attachment recovery
after an OS process restart. Those limits are deliberate and remain unverified.
Sanitized [evidence](evidence/document-email-dev-activation-2026-11-26.json)
records outcomes and the applied DDL hash, without recipient/business data or
credentials. Private harness/logs remain outside tracked source.

## Focused verification

From backend:

```powershell
npm test -- --runInBand --silent --runTestsByPath src/documents/document-email-queue.spec.ts src/documents/document-email-issuance.spec.ts src/documents/document-email-scheduler.guard.spec.ts
```

Exit 0, three suites / 39 tests, 44.206s, zero snapshots. Includes retry/unknown,
transaction ordering and OIDC guard behavior using controlled transports. Product
executable source did not change from 6906f809; prior build evidence is reused.
No full suite, live SMTP/provider send or Cloud scheduler call was performed.
Documentation links/evidence integrity and git diff --check verified separately.

Activation does not implement early original-upload overlap or entry-screen
logo/server preloading. Those remain separate code work. The earlier feature
branch push authorization applies only to its own remote branch; main is not
integrated or updated.
