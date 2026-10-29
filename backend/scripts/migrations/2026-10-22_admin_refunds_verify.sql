-- REVIEW DRAFT. READ ONLY, operator-run after approved apply; keep all writers paused.
USE `keepintax-prod`;
SELECT DATABASE() AS selected_database, VERSION() AS mysql_version;
-- Exactly 10 rows. operation=enum('CHARGE','REFUND'), default CHARGE, not nullable;
-- both charge FK columns become nullable; new optional fields are nullable.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, GENERATION_EXPRESSION
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billing_attempt'
  AND COLUMN_NAME IN ('operation','source_payment_event_id','request_id','requested_by_firebase_id',
    'refund_reason','refund_provider_transaction_id','obligation_id','plan_id','trigger','charge_mode')
ORDER BY ORDINAL_POSITION;
-- Above: 10 rows (6 new columns + 2 nullable FK columns + 2 appended enum columns).
-- event_type retains its prior values/order with these four additions;
-- refund_success_attempt_id is int, VIRTUAL GENERATED (not STORED).
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, EXTRA, GENERATION_EXPRESSION
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billing_event'
  AND COLUMN_NAME IN ('event_type','refund_success_attempt_id');
-- Two tables, five new indexes, ten index-column rows:
-- unique request(request_id); source(source_payment_event_id,operation,status);
-- action(operation,status,next_action_at); unique provider(provider_terminal_ref,refund_provider_transaction_id);
-- unique success(refund_success_attempt_id). Exact SEQ_IN_INDEX order matters.
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
  AND INDEX_NAME IN ('ux_billing_attempt_request','ix_billing_attempt_refund_source',
    'ix_billing_attempt_operation_action','ux_billing_attempt_refund_provider','ux_billing_event_refund_success')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
-- Exactly one source FK; REFERENCES billing_event(id), RESTRICT/CASCADE.
SELECT r.TABLE_NAME, r.CONSTRAINT_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME,
       k.REFERENCED_COLUMN_NAME, r.DELETE_RULE, r.UPDATE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS r
JOIN information_schema.KEY_COLUMN_USAGE k ON k.CONSTRAINT_SCHEMA=r.CONSTRAINT_SCHEMA
  AND k.TABLE_NAME=r.TABLE_NAME AND k.CONSTRAINT_NAME=r.CONSTRAINT_NAME
WHERE r.CONSTRAINT_SCHEMA=DATABASE() AND r.CONSTRAINT_NAME='fk_billing_attempt_refund_source';
-- Exactly four BEFORE triggers, on matching attempt/event tables, INSERT and UPDATE.
-- Compare full ACTION_STATEMENT to the reviewed apply file, not just names/counts.
SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, ACTION_STATEMENT
FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()
  AND TRIGGER_NAME IN ('ck_billing_attempt_operation_insert','ck_billing_attempt_operation_update',
    'ck_billing_event_refund_success_insert','ck_billing_event_refund_success_update')
ORDER BY TRIGGER_NAME;
-- These existing safeguards MUST still be present, definitions unchanged from preflight.
SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
  AND CONSTRAINT_NAME IN ('ck_billing_attempt_amounts','ck_billing_attempt_number',
    'ux_documents_billing_attempt','fk_documents_billing_attempt');
-- Each invalid_* count must be 0; no REFUND rows exist immediately after first apply.
SELECT COUNT(*) AS invalid_charge_rows FROM billing_attempt
WHERE operation='CHARGE' AND (obligation_id IS NULL OR plan_id IS NULL
  OR source_payment_event_id IS NOT NULL OR `trigger`='REFUND' OR charge_mode='TRANSACTION_REFUND');
SELECT COUNT(*) AS invalid_refund_rows FROM billing_attempt
WHERE operation='REFUND' AND (obligation_id IS NOT NULL OR source_payment_event_id IS NULL
  OR request_id IS NULL OR requested_by_firebase_id IS NULL OR refund_reason IS NULL
  OR CHAR_LENGTH(TRIM(refund_reason))=0 OR provider_terminal_ref IS NULL OR amount_agorot<=0
  OR `trigger`<>'REFUND' OR charge_mode<>'TRANSACTION_REFUND');
SELECT COUNT(*) AS invalid_refund_success_rows FROM billing_event
WHERE event_type='REFUND_SUCCESS' AND (billing_attempt_id IS NULL OR amount_agorot IS NULL
  OR amount_agorot>=0 OR amount_before_vat_agorot IS NULL OR amount_before_vat_agorot>0
  OR vat_amount_agorot IS NULL OR vat_amount_agorot>0
  OR amount_before_vat_agorot+vat_amount_agorot<>amount_agorot);
SELECT operation, COUNT(*) AS attempts FROM billing_attempt GROUP BY operation;
SELECT (SELECT COUNT(*) FROM billing_attempt) AS attempts,
       (SELECT COUNT(*) FROM billing_event) AS events,
       (SELECT COUNT(*) FROM documents) AS documents,
       (SELECT COUNT(*) FROM billing_attempt_obligation) AS debt_links;
-- Compare counts to paused-writer preflight/apply output. No business rows are inserted here.
SHOW CREATE TABLE billing_attempt;
SHOW CREATE TABLE billing_event;
SHOW CREATE TABLE documents;
