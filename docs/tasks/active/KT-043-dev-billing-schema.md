# KT-043 — Apply approved billing schema to shared dev

- Status: COMPLETE — dev schema execution verified; evidence committed locally
- Owner: Codex
- Date: 2026-10-06 (Asia/Jerusalem)
- Branch: codex/billing-debt-recovery
- Application base: e6cfbd2f
- Authorization: Elazar explicitly confirmed inspection and execution of missing
  billing schema changes on the shared dev database. No production, provider,
  deployment or application startup authorization was inferred.

## Target and procedure

Connection identity verified as keepintax-dev, MySQL 8.0.37-google, using
existing local dev configuration. Credentials were not logged or copied.
Used a temporary standalone mysql2 script, never Nest/TypeORM synchronize.
The script refused any database other than keepintax-dev and any nonempty
existing canonical billing aggregate. Before execution it recorded schema
definitions/inventory and acquired a named advisory lock, with a five-second
metadata lock wait limit. The lock coordinates this script only; it is not an
application-wide writer pause. No app was started or stopped by this task.

Executed only the approved cutover.sql tail from Section 19 through Section 20:
existing tables/columns/indexes/constraints were retained through the script's
conditional SQL; Sections 1–18 were not executed. Existing canonical tables
were present and empty, and their required columns were verified before DDL.
After DDL, verified identity, required columns/FKs, nonunique debt-pointer
indexes, absence of the replaced unique indexes, and unchanged row counts.
All checks passed. DDL auto-commits in MySQL; no rollback claim is made.

## Changes observed

- New billing_attempt_obligation table: composite attempt/debt key, debt lookup
  index and both restricted-delete foreign keys.
- subscription: billing_anchor_day and active_payment_method_update_attempt_id.
- payment_method: source_update_attempt_id and cardcom_token_delete_at.
- documents: billing_attempt_id with unique provenance index/FK.
- billing_event: billing_obligation_id, billing_attempt_id and
  payment_method_update_attempt_id with correlation indexes/FKs.
- Added the corresponding subscription/payment-method provenance FKs and
  subscription anchor CHECK constraint; retained existing canonical tables.
- billing_obligation: active/satisfied pointer indexes now nonunique, preserving
  their foreign keys. Empty existing attempts meant link backfill inserted zero.

## Data preservation evidence

| Table | Before | After |
| --- | ---: | ---: |
| subscription | 18 | 18 |
| subscription_plan | 5 | 5 |
| payment_method | 3 | 3 |
| billing_event | 33 | 33 |
| documents | 18 | 18 |
| billing_obligation | 0 | 0 |
| billing_attempt | 0 | 0 |
| payment_method_update_attempt | 0 | 0 |
| billing_attempt_obligation | absent | 0 |

Existing values were not updated by these sections. New fields are nullable
and no historical debts, anchors or prices were invented. No synthetic rows,
actual charge, invoice or token update was created.

## Verification and remaining work

- Read-only inspect: passed, exit 0.
- Temporary execution script syntax check: passed, exit 0.
- Guarded dev schema apply and postflight: passed, exit 0.
- Existing merged-code evidence remains: 25 suites / 331 backend tests,
  frontend recovery 5/5, and both builds passed before this schema-only task.
- Real hosted checkout/card storage/multi-line receipt E2E is still untested.
  Schema readiness does not prove provider completion or historical debt
  backfill readiness. Initial purchase/upgrade canonicalization remains pending.
- Raw temporary schema inventories and the machine-specific execution helper
  were removed after this non-secret evidence was recorded; no automatic
  migration runner or credential-bearing file is added to the repository.
- No push, production access, live provider call or NEW-AI-CHAT modification.
