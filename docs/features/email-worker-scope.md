# Email worker routing in shared DEV

## Contract and production compatibility

This routes the durable Gmail/Outlook intake and its email-origin document work
between local and test servers sharing keepintax-dev. It does not route every
other application background task, unrelated document jobs, billing or banking.
The backend alone chooses the scope; HTTP input cannot choose or override it.

| Server configuration | New email runs | Eligible email work |
| --- | --- | --- |
| EMAIL_WORKER_SCOPE=local | worker_scope=local | exact local scope only |
| EMAIL_WORKER_SCOPE=test | worker_scope=test | exact test scope only |
| Unset (production compatibility) | column omitted, default NULL | existing unfiltered behavior |

Only local/test values are accepted. Enabling routing requires non-production
NODE_ENV, COMPOSIO_ENVIRONMENT=dev, live DATABASE()=keepintax-dev, and the reviewed
worker_scope column. An accidental routing flag in production refuses startup
instead of silently ignoring work. When unset, no new column is referenced by
worker SQL or TypeORM metadata; the production schema/code can be rolled out in
stages without enabling DEV routing. This preserves behavior; it is not a promise
of zero deployment risk. Production was neither accessed nor modified.

Run listing and direct lease acquisition are both filtered. Downstream imported
work follows its immutable email_run_id, with matching owner/business; AI jobs
with purpose GMAIL follow their context importId to the same run. Admission,
completion, stale-lease recovery and terminal reporting retain these filters.
Global AI concurrency/capacity and existing content dedup remain shared: identical
content does not create extra documents or extra paid attempts merely because a
second environment imports it. Other document job purposes keep existing behavior.
Protected email PDFs preserve emailRunId in server-authored metadata so upload
recovery is routed even before original_import_id is available; later delivery and
replacement processing inherit the original run. Unrelated protected PDFs retain
their existing processing behavior.

Two environments cannot overlap an active pull for the same integration because
connection sync status/cursor are shared. A caller encountering another scope's
active run receives a conflict, never the foreign run ID. Exact-scope active work
is reused. Routing does not create separate mailbox connections, files, cursors or
accounting data. Retention and owner/business authorization remain unchanged.

Nightly email run creation runs on test only when routing is configured. Local
creates user-requested runs and processes local work. With no routing flag,
nightly behavior remains unchanged. A stopped local worker leaves its tasks for
its next startup; test does not adopt local tasks.

## Schema

Standalone SQL: [email-worker-scope.sql](email-worker-scope.sql).
The same additive nullable column and nonunique index are prepared for DEV and
production and recorded in [cutover.sql](../redesign/cutover.sql). Production
execution still needs separate explicit authorization and a production preflight.
There is no automatic migration or schema synchronization. No backfill is supplied:
existing rows remain NULL and scoped workers do not adopt them automatically.
Do not run the full cumulative cutover file to apply this change.

DEV-only helper (backend directory):

```powershell
node scripts/apply-email-worker-scope-dev.cjs
node scripts/apply-email-worker-scope-dev.cjs --apply
node --test scripts/apply-email-worker-scope-dev.test.cjs
```

The helper hardcodes keepintax-dev, validates environment and actual database,
checks exact column/index shape, defaults to inspect, takes the scanner lock,
refuses active pulls, and applies one online InnoDB ALTER with a bounded metadata
lock wait. It does not boot Nest, call providers or change queue data. Applying it
again against the exact resulting schema is a no-op. Prepared DDL requires a
compatible MySQL/InnoDB version; unsupported algorithm/shape must fail visibly.

## Activation order (not yet executed)

1. Apply the standalone schema to DEV (completed 2026-11-24).
2. Update every backend/worker sharing this DEV queue, including other local
   feature servers. Old binaries and new binaries without the scope setting
   still select all runs; a column alone cannot constrain them.
3. Configure the test server EMAIL_WORKER_SCOPE=test and the local server
   EMAIL_WORKER_SCOPE=local. Ensure only one nightly creator is configured.
   Multiple servers with the same scope intentionally share that scope's work.
4. Verify exact-scope selection/claims on each server. Then remove the temporary
   EMAIL_DEV_EXCLUSIVE_SCANNER setting and restart the local feature server.

No cloud deployment/configuration, remote push or main integration was authorized
in this task. Consequently the new routing is prepared and verified but has not
been activated against the still-old shared test/cloud workers. The local ignored
configuration keeps the previous exclusive scanner protection and leaves
EMAIL_WORKER_SCOPE unset; this prevents claiming isolation that old workers cannot
enforce. Keep that temporary protection until the coordinated DEV update.

## Verification

Offline coverage includes no-flag production SQL, invalid/production configuration,
server-authored creation, direct foreign claims, same/foreign active runs,
downstream claims, protected delivery and nightly creation policy. Existing intake,
AI and protected-PDF regression suites also run without the flag.

```powershell
node scripts/verify-email-worker-scope-dev.cjs --rollback-probe
```

This explicit DEV-only acceptance script holds the scanner lock, requires an idle
pull queue and uses synthetic local/test/NULL runs, imported work, AI jobs and
protected operations in one always-rolled-back transaction. It calls the compiled
stores against actual MySQL to verify selection and claim isolation, including
completion and protected upload recovery. No Nest bootstrap, provider/Drive calls,
real document contents or paid AI. It verifies every synthetic row is absent after
rollback. MySQL auto-increment values reserved for fixtures can leave harmless gaps.
Exact results and live application evidence are in the
[task record](../tasks/active/outlook-email.md).
