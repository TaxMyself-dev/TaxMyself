# Feezback lifecycle and admin control

## Business rules

Feezback's supplied October–November 2026 correspondence confirms billing per
active identity at month end, rather than per bank consent. A spouse is a separate
paid identity. The primary and spouse each contribute zero or one unit; multiple
valid consents for the same identity do not increase cost. Estimates are based on
the most recent verification, not an invoice or proof of month-end billing.

No tenant-wide user listing exists at Feezback. We query every locally known user
at both existing identity formats with `GET .../consents?withInvalid=true`.
Provider-only identities with no local trace cannot be discovered. Only consent
ids, statuses and validity dates are retained. Valid, unexpired consents count;
unknown statuses/dates, failed reads and never-checked identities remain unknown.
A failed read preserves last successful evidence and timestamp, with an error.
The cost calculation does not depend on successful bank/card source discovery.

Own subscription access determines eligibility, without modifying accountant or
delegation authorization. Complimentary access remains eligible. Trial eligibility
requires PREPARE/READY enrollment for the exact trial boundary; CANCEL removes
eligibility even while ordinary trial module access remains broad. An approved
READY trial awaiting canonical billing activation is shown as unknown/manual review,
not automatically disconnected before billing has resolved its transition. Missing
subscriptions/plans also require review rather than destructive inference.

## Durable queue and concurrency

`feezback_lifecycle` stores one operational row per local user: evidence, retry date,
lease, generation, eligibility fingerprint, pending manual request and last error/action.
TypeORM subscribers enqueue in the same transaction as billing events and relevant
subscription/plan updates. Thus canceled transactions cannot publish work. Bulk
updates without identifiers invalidate all subscriptions conservatively. Webhooks
enqueue re-verification before existing source refresh/cleanup, including late onboarding.
No new provider calls occur on ordinary list initialization or in billing transactions.

The seed/eligibility repair runs every ten minutes in 100-user keyset pages. It creates
missing jobs and detects natural eligibility expiry or missed mutations. Successful
observations schedule another check within 24 hours or at an upcoming eligibility
boundary. The worker runs every 30 seconds, takes at most ten due rows and processes
them serially. Errors retry with exponential backoff from one minute to six hours.
Process-local overlap protection plus 30-minute database leases prevent concurrent
claims; generations prevent an older completion from erasing newly queued work.

Immediately before automatic termination the worker rechecks eligibility while holding
the subscription row lock. A completed renewal/upgrade prevents termination. Renewal
starting afterwards waits for the already-authorized disconnect; provider network I/O
can therefore temporarily delay concurrent billing edits. No locks are held while
initially observing the provider. Termination reuses the existing all-consent service
and verifies both identities afterwards. Partial/uncertain outcomes remain pending.
Permanent accounting data is preserved by the existing disconnection path.

## Admin tab

The existing admin panel includes a Feezback tab. Saved-state pages are fetched in
bounded batches and combined for search, global filters and 50-row display pagination.
Each server page batches local subscription/plan/state/enrollment reads; it never calls
Feezback. The table includes own entitlement, primary/spouse evidence, expected 0–2
units, mismatches, pending operations and errors. Known fresh units and unknown users
are shown separately. Synthetic demos are visible but excluded from live actions/cost.
Month-end warnings use Asia/Jerusalem and appear during the last six calendar dates.

Per-row check and confirmed full disconnect enqueue durable work. A manual admin
disconnect may explicitly disconnect an otherwise entitled user. Real actor identity
is checked server-side; effective impersonated/delegated identity never grants admin
authority. Provider/token errors are reduced to fixed operational codes. Existing
user-facing disconnect endpoints are unchanged.

Row actions immediately show a spinner and a sending label, then retain queued
progress beside the affected user until a saved-state refresh reports completion
or failure. A fixed status notice remains visible while scrolling. User-requested
work polls saved state every five seconds; ordinary background pending work retains
the thirty-second refresh cadence. Queue acceptance is never labeled completed
provider work. An older in-flight table load cannot settle a newer action, and
automatic reloads preserve the current display page. Both dialog X controls update
their owning signals on PrimeNG `visibleChange`, rather than waiting for `onHide`.

## Schema, activation and rollback

1. Apply [feezback-lifecycle.sql](feezback-lifecycle.sql) explicitly to the intended
   environment before activation. It is also appended to the cutover script.
2. Set `FEEZBACK_LIFECYCLE_ENABLED=true`. Leave
   `FEEZBACK_LIFECYCLE_AUTODISCONNECT` unset/false for the initial observation-only rollout.
   Existing consents are not automatically revoked in this mode; confirmed manual
   admin disconnections still work.
3. Review the table's historical mismatches and unknowns. Only then enable
   `FEEZBACK_LIFECYCLE_AUTODISCONNECT=true` for automatic all-consent termination.
4. Confirm the deployment continuously runs scheduled Nest workers. A scale-to-zero
   or CPU-throttled Cloud Run service needs an appropriate always-running worker/
   deployment scheduling configuration; process timers alone do not guarantee execution.
   This feature does not provision cloud resources or alter production settings.

Disable automatic termination independently by clearing its flag. Disable the entire
feature by clearing ENABLED; the new table is then unused, and old billing operations
do not depend on it. Already terminated consents require new owner consent to reconnect.
Tests do not make permanent schema changes. Separately authorized environment
setup is recorded in the task evidence; production has not been changed.

Worktree ports and API URL are configured in ignored `.local-ai-dev/ports.json`
and backend/.env. Verify effective settings without starting services using
`node frontend/scripts/start-local.js --print-config` and
`node backend/scripts/start-watch.js --print-config`. Main's configuration is unchanged.

## Verification

Focused tests cover identity cost, trial cancellation, billing activation uncertainty,
admin authorization, durable retry/generation behavior, renewed entitlement, both
identities, saved-state-only reads, subscriber invalidation and the actual RTL template.
Existing disconnection/access/webhook regression suites are included in final verification.
The opt-in persistence suite uses a connection-scoped MySQL TEMPORARY table on
`keepintax-dev`, shadows any permanent table, and verifies transactional rollback and
generation-safe updates without permanent DDL or user changes.

See [task evidence](../tasks/active/feezback-lifecycle.md) for commands and results.
