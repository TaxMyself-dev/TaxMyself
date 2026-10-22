-- REVIEW DRAFT / NOT APPROVED OR EXECUTED IN PRODUCTION.
-- One-shot MySQL 8.0.37 migration. See docs/features/admin-refunds-release.md.
-- Backup + pause ALL backend writers first. Use a client that STOPS on first error.
-- DDL auto-commits: no ROLLBACK, no --force, no blind rerun after partial failure.
-- After explicit approval only, replace PENDING_OWNER_APPROVAL with
-- APPROVED_ADMIN_REFUNDS_2026_10_22 in the next line in your reviewed local copy.
USE `keepintax-prod`;
SET @kt_refunds_approval = 'PENDING_OWNER_APPROVAL';
SET SESSION lock_wait_timeout = 30;

DELIMITER $$
CREATE PROCEDURE kt_prepare_admin_refunds_20261022()
BEGIN
  DECLARE enum_type LONGTEXT;
  DECLARE missing_values LONGTEXT;
  IF DATABASE() <> 'keepintax-prod'
     OR COALESCE(@kt_refunds_approval, '') <> 'APPROVED_ADMIN_REFUNDS_2026_10_22' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: explicit owner approval required';
  END IF;
  IF VERSION() NOT LIKE '8.0.%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: unreviewed MySQL version';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME IN ('billing_attempt','billing_event','documents','billing_attempt_obligation')
      AND ENGINE='InnoDB') <> 4 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: canonical billing baseline missing';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND (
      (TABLE_NAME='billing_attempt' AND COLUMN_NAME IN ('operation','source_payment_event_id',
        'request_id','requested_by_firebase_id','refund_reason','refund_provider_transaction_id'))
      OR (TABLE_NAME='billing_event' AND COLUMN_NAME='refund_success_attempt_id'))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: existing or partial refund schema; stop and inspect';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME='billing_attempt' AND COLUMN_NAME IN ('obligation_id','plan_id')
      AND COLUMN_TYPE='int' AND IS_NULLABLE='NO') <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: unexpected charge FK column definitions';
  END IF;
  IF EXISTS (SELECT 1 FROM billing_attempt WHERE obligation_id IS NULL OR plan_id IS NULL
      OR amount_agorot < 0 OR amount_before_vat_agorot < 0 OR vat_amount_agorot < 0
      OR amount_before_vat_agorot + vat_amount_agorot <> amount_agorot) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: invalid existing charge data';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND TABLE_NAME='billing_attempt' AND CONSTRAINT_TYPE='CHECK'
      AND CONSTRAINT_NAME IN ('ck_billing_attempt_number','ck_billing_attempt_amounts')) <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: existing amount/attempt checks missing';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME IN ('billing_attempt','billing_event') AND COLUMN_NAME='id'
      AND COLUMN_TYPE='int') <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: unexpected attempt/event primary key type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME='documents' AND INDEX_NAME='ux_documents_billing_attempt'
      AND COLUMN_NAME='billing_attempt_id' AND NON_UNIQUE=0)
     OR NOT EXISTS (SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='documents'
      AND CONSTRAINT_NAME='fk_documents_billing_attempt' AND REFERENCED_TABLE_NAME='billing_attempt') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: document attempt provenance missing';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()
      AND TRIGGER_NAME IN ('ck_billing_attempt_operation_insert','ck_billing_attempt_operation_update',
        'ck_billing_event_refund_success_insert','ck_billing_event_refund_success_update')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: refund trigger name already exists';
  END IF;
  -- Require enum columns without defaults; preserve every existing value and its order.
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
      AND ((TABLE_NAME='billing_attempt' AND COLUMN_NAME IN ('trigger','charge_mode'))
        OR (TABLE_NAME='billing_event' AND COLUMN_NAME='event_type'))
      AND DATA_TYPE='enum' AND IS_NULLABLE='NO' AND COLUMN_DEFAULT IS NULL) <> 3 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Admin refunds: unexpected enum baseline';
  END IF;
  SELECT COUNT(*) INTO @kt_refunds_before_attempts FROM billing_attempt;
  SELECT COUNT(*) INTO @kt_refunds_before_events FROM billing_event;
  SELECT COUNT(*) INTO @kt_refunds_before_documents FROM documents;
  SELECT COUNT(*) INTO @kt_refunds_before_links FROM billing_attempt_obligation;

  SELECT COLUMN_TYPE INTO enum_type FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billing_attempt' AND COLUMN_NAME='trigger';
  IF LOCATE(QUOTE('REFUND'), enum_type)=0 THEN
    SET @kt_refunds_sql=CONCAT('ALTER TABLE billing_attempt MODIFY COLUMN `trigger` ',
      LEFT(enum_type, CHAR_LENGTH(enum_type)-1), ',''REFUND'') NOT NULL');
    PREPARE kt_refunds_stmt FROM @kt_refunds_sql;
    EXECUTE kt_refunds_stmt;
    DEALLOCATE PREPARE kt_refunds_stmt;
  END IF;
  SELECT COLUMN_TYPE INTO enum_type FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billing_attempt' AND COLUMN_NAME='charge_mode';
  IF LOCATE(QUOTE('TRANSACTION_REFUND'), enum_type)=0 THEN
    SET @kt_refunds_sql=CONCAT('ALTER TABLE billing_attempt MODIFY COLUMN charge_mode ',
      LEFT(enum_type, CHAR_LENGTH(enum_type)-1), ',''TRANSACTION_REFUND'') NOT NULL');
    PREPARE kt_refunds_stmt FROM @kt_refunds_sql;
    EXECUTE kt_refunds_stmt;
    DEALLOCATE PREPARE kt_refunds_stmt;
  END IF;
  SELECT COLUMN_TYPE INTO enum_type FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billing_event' AND COLUMN_NAME='event_type';
  SELECT GROUP_CONCAT(QUOTE(enum_value) ORDER BY enum_order SEPARATOR ',') INTO missing_values
  FROM JSON_TABLE('["REFUND_REQUESTED","REFUND_SUCCESS","REFUND_FAILED","REFUND_RESOLUTION"]',
    '$[*]' COLUMNS (enum_order FOR ORDINALITY, enum_value VARCHAR(100) PATH '$')) AS required_values
  WHERE LOCATE(QUOTE(enum_value), enum_type)=0;
  IF missing_values IS NOT NULL THEN
    SET @kt_refunds_sql=CONCAT('ALTER TABLE billing_event MODIFY COLUMN event_type ',
      LEFT(enum_type, CHAR_LENGTH(enum_type)-1), ',', missing_values, ') NOT NULL');
    PREPARE kt_refunds_stmt FROM @kt_refunds_sql;
    EXECUTE kt_refunds_stmt;
    DEALLOCATE PREPARE kt_refunds_stmt;
  END IF;

  ALTER TABLE billing_attempt
    ADD COLUMN operation enum('CHARGE','REFUND') NOT NULL DEFAULT 'CHARGE',
    ADD COLUMN source_payment_event_id int NULL,
    ADD COLUMN request_id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    ADD COLUMN requested_by_firebase_id varchar(255) NULL,
    ADD COLUMN refund_reason varchar(500) NULL,
    ADD COLUMN refund_provider_transaction_id varchar(128) GENERATED ALWAYS AS
      (CASE WHEN operation='REFUND' THEN cardcom_transaction_id ELSE NULL END) STORED,
    MODIFY COLUMN obligation_id int NULL,
    MODIFY COLUMN plan_id int NULL,
    ADD UNIQUE KEY ux_billing_attempt_request (request_id),
    ADD KEY ix_billing_attempt_refund_source (source_payment_event_id,operation,status),
    ADD KEY ix_billing_attempt_operation_action (operation,status,next_action_at),
    ADD UNIQUE KEY ux_billing_attempt_refund_provider (provider_terminal_ref,refund_provider_transaction_id),
    ADD CONSTRAINT fk_billing_attempt_refund_source FOREIGN KEY (source_payment_event_id)
      REFERENCES billing_event(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE billing_event
    ADD COLUMN refund_success_attempt_id int GENERATED ALWAYS AS
      (CASE WHEN event_type='REFUND_SUCCESS' THEN billing_attempt_id ELSE NULL END) VIRTUAL,
    ADD UNIQUE KEY ux_billing_event_refund_success (refund_success_attempt_id);
END$$
CALL kt_prepare_admin_refunds_20261022()$$
DROP PROCEDURE kt_prepare_admin_refunds_20261022$$

-- Equivalent to the approved CHECK invariants: MySQL rejects CHECK on cascading FK columns.
CREATE TRIGGER ck_billing_attempt_operation_insert BEFORE INSERT ON billing_attempt FOR EACH ROW
BEGIN
  IF COALESCE((
    (NEW.operation='CHARGE' AND NEW.obligation_id IS NOT NULL AND NEW.plan_id IS NOT NULL
      AND NEW.source_payment_event_id IS NULL AND NEW.`trigger`<>'REFUND' AND NEW.charge_mode<>'TRANSACTION_REFUND')
    OR (NEW.operation='REFUND' AND NEW.obligation_id IS NULL AND NEW.source_payment_event_id IS NOT NULL
      AND NEW.request_id IS NOT NULL AND NEW.requested_by_firebase_id IS NOT NULL
      AND NEW.refund_reason IS NOT NULL AND CHAR_LENGTH(TRIM(NEW.refund_reason))>0
      AND NEW.provider_terminal_ref IS NOT NULL AND NEW.amount_agorot>0
      AND NEW.`trigger`='REFUND' AND NEW.charge_mode='TRANSACTION_REFUND')
  ),0)=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ck_billing_attempt_operation'; END IF;
END$$
CREATE TRIGGER ck_billing_attempt_operation_update BEFORE UPDATE ON billing_attempt FOR EACH ROW
BEGIN
  IF COALESCE((
    (NEW.operation='CHARGE' AND NEW.obligation_id IS NOT NULL AND NEW.plan_id IS NOT NULL
      AND NEW.source_payment_event_id IS NULL AND NEW.`trigger`<>'REFUND' AND NEW.charge_mode<>'TRANSACTION_REFUND')
    OR (NEW.operation='REFUND' AND NEW.obligation_id IS NULL AND NEW.source_payment_event_id IS NOT NULL
      AND NEW.request_id IS NOT NULL AND NEW.requested_by_firebase_id IS NOT NULL
      AND NEW.refund_reason IS NOT NULL AND CHAR_LENGTH(TRIM(NEW.refund_reason))>0
      AND NEW.provider_terminal_ref IS NOT NULL AND NEW.amount_agorot>0
      AND NEW.`trigger`='REFUND' AND NEW.charge_mode='TRANSACTION_REFUND')
  ),0)=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ck_billing_attempt_operation'; END IF;
END$$
CREATE TRIGGER ck_billing_event_refund_success_insert BEFORE INSERT ON billing_event FOR EACH ROW
BEGIN
  IF COALESCE((NEW.event_type<>'REFUND_SUCCESS' OR (
    NEW.billing_attempt_id IS NOT NULL AND NEW.amount_agorot IS NOT NULL AND NEW.amount_agorot<0
    AND NEW.amount_before_vat_agorot IS NOT NULL AND NEW.amount_before_vat_agorot<=0
    AND NEW.vat_amount_agorot IS NOT NULL AND NEW.vat_amount_agorot<=0
    AND NEW.amount_before_vat_agorot+NEW.vat_amount_agorot=NEW.amount_agorot)),0)=0
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ck_billing_event_refund_success'; END IF;
END$$
CREATE TRIGGER ck_billing_event_refund_success_update BEFORE UPDATE ON billing_event FOR EACH ROW
BEGIN
  IF COALESCE((NEW.event_type<>'REFUND_SUCCESS' OR (
    NEW.billing_attempt_id IS NOT NULL AND NEW.amount_agorot IS NOT NULL AND NEW.amount_agorot<0
    AND NEW.amount_before_vat_agorot IS NOT NULL AND NEW.amount_before_vat_agorot<=0
    AND NEW.vat_amount_agorot IS NOT NULL AND NEW.vat_amount_agorot<=0
    AND NEW.amount_before_vat_agorot+NEW.vat_amount_agorot=NEW.amount_agorot)),0)=0
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ck_billing_event_refund_success'; END IF;
END$$
DELIMITER ;

-- SAME SESSION, writers still paused: each expression must be 1.
SELECT (SELECT COUNT(*) FROM billing_attempt)=@kt_refunds_before_attempts AS attempts_unchanged,
       (SELECT COUNT(*) FROM billing_event)=@kt_refunds_before_events AS events_unchanged,
       (SELECT COUNT(*) FROM documents)=@kt_refunds_before_documents AS documents_unchanged,
       (SELECT COUNT(*) FROM billing_attempt_obligation)=@kt_refunds_before_links AS links_unchanged;
-- Run the separate verify file before starting any application revision.
