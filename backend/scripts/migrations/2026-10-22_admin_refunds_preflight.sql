-- REVIEW DRAFT: operator-run only after owner approval. READ ONLY.
-- Run on the selected production database; do not import the cumulative cutover.
USE `keepintax-prod`;
SELECT DATABASE() AS selected_database, VERSION() AS mysql_version, @@sql_mode AS sql_mode;
SHOW CREATE TABLE billing_attempt;
SHOW CREATE TABLE billing_event;
SHOW CREATE TABLE documents;
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
       EXTRA, GENERATION_EXPRESSION
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('billing_attempt','billing_event','documents')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('billing_attempt','billing_event','documents')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, UPDATE_RULE, DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN ('billing_attempt','billing_event','documents');
SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, ACTION_STATEMENT
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE IN ('billing_attempt','billing_event');
-- Must be zero. Existing rows become CHARGE by default; do not invent missing links.
SELECT COUNT(*) AS invalid_existing_attempts
FROM billing_attempt
WHERE obligation_id IS NULL OR plan_id IS NULL OR amount_agorot < 0
   OR amount_before_vat_agorot < 0 OR vat_amount_agorot < 0
   OR amount_before_vat_agorot + vat_amount_agorot <> amount_agorot;
-- All must be zero: this is a one-shot migration from the pre-refund baseline.
SELECT TABLE_NAME, COLUMN_NAME AS already_present_refund_column
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND (
  (TABLE_NAME='billing_attempt' AND COLUMN_NAME IN ('operation','source_payment_event_id',
    'request_id','requested_by_firebase_id','refund_reason','refund_provider_transaction_id'))
  OR (TABLE_NAME='billing_event' AND COLUMN_NAME='refund_success_attempt_id'));
SELECT (SELECT COUNT(*) FROM billing_attempt) AS attempts,
       (SELECT COUNT(*) FROM billing_event) AS events,
       (SELECT COUNT(*) FROM documents) AS documents,
       (SELECT COUNT(*) FROM billing_attempt_obligation) AS debt_links;
-- Record these counts again after all writers are paused, immediately before apply.
-- No customer data, credentials, DML, provider requests or synthetic rows are used.
