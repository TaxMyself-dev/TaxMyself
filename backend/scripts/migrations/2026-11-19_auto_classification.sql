-- Apply only after onboarding schema, first to an explicitly authorized isolated development DB.
-- Do not run the historic cumulative cutover script. No schema is applied on boot.
CREATE TABLE IF NOT EXISTS agent_auto_preferences (
 owner_uid varchar(128) PRIMARY KEY, enabled boolean NOT NULL DEFAULT false,
 version int NOT NULL DEFAULT 0, consent_version int NOT NULL DEFAULT 1,
 changed_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 scan_cursor bigint NOT NULL DEFAULT 0, next_scan_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 last_error varchar(100) NULL, notice_seen boolean NOT NULL DEFAULT false,
 INDEX idx_auto_due(enabled,next_scan_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS agent_auto_items (
 id varchar(36) PRIMARY KEY, owner_uid varchar(128) NOT NULL,
 external_id varchar(255) NOT NULL, business_number varchar(100) NOT NULL,
 state varchar(20) NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0,
 reason text NULL, question text NULL, answer text NULL, display_json json NOT NULL,
 rule_id int NULL, category varchar(255) NULL, sub_category varchar(255) NULL,
 retry_at datetime(3) NULL, read_at datetime(3) NULL,
 created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_auto_owner_tx(owner_uid,external_id),
 INDEX idx_auto_unread(owner_uid,read_at,state), INDEX idx_auto_inbox(owner_uid,updated_at,id), INDEX idx_auto_state(owner_uid,state,retry_at)
) ENGINE=InnoDB;
-- Explicit columns: NULL means historical source is unknown; never infer USER.
ALTER TABLE classified_transactions ADD COLUMN createdBySource varchar(10) NULL,
 ADD COLUMN updatedBySource varchar(10) NULL;
ALTER TABLE slim_transactions ADD COLUMN classificationSource varchar(10) NULL;

ALTER TABLE full_transactions_cache ADD COLUMN classificationSource varchar(10) NULL;
