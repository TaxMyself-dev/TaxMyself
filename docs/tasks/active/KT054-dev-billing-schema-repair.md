# KT054 — Restore dev billing schema after parallel synchronize

- Status: COMPLETE (schema restoration; deleted historical values are not recovered)
- Date: 2026-10-08, Asia/Jerusalem
- Branch: codex/billing-debt-recovery
- Authorization: owner confirmed parallel developer ran synchronize and requested restoring removed billing fields.
- Target: keepintax-dev only, configured billing worktree datasource.

## Repair

Compared compiled billing entity column metadata with information_schema without booting Nest. Restored nine missing columns: subscription billing_access_mode, billing_anchor_day and active_payment_method_update_attempt_id; payment_method source_update_attempt_id and cardcom_token_delete_at; billing_event billing_obligation_id, billing_attempt_id and payment_method_update_attempt_id; documents billing_attempt_id (billing provenance only).

Reused the existing cutover.sql section 17 column definition and section 19 additive column/index/constraint definitions, applying only absent objects. Restored five indexes, six foreign keys and the billing anchor check. No full cutover, synchronization, app boot, provider calls, production access or push. No new schema design; existing cutover definitions remain authoritative.

## Verification and limits

Row counts before/after unchanged: subscription 18, payment_method 4, billing_event 62, documents 20, billing_attempt 4, billing_obligation 3, billing_attempt_obligation 4, payment_method_update_attempt 0. Test subscription 7 remains TRIAL, STANDARD, original test trial ending October 17, with no card update reservation. All compiled billing entity columns present after repair.

MySQL DDL auto-commits. Recreating a dropped column does not recover its deleted values: nullable provenance fields were restored NULL; access mode was restored with STANDARD default. Historical anchor/provenance/exemption data needs an independently verified backup or event-based recovery if required; no guessed backfill was performed. Use start:billing/start:watch (DISABLE_SYNCHRONIZE=true); another synchronize run from an older branch can remove the schema again.
