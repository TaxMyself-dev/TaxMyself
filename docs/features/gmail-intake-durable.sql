-- PREPARED ONLY. Requires separate approval before applying to any database.
CREATE TABLE email_import_runs (
 id CHAR(36) PRIMARY KEY, firebase_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 business_number VARCHAR(255) NOT NULL, integration_id INT NOT NULL, sync_type VARCHAR(16) NOT NULL,
 query_text TEXT NOT NULL, from_date DATE NULL, to_date DATE NULL,
 scan_state VARCHAR(24) NOT NULL DEFAULT 'READY', pull_state VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
 processing_state VARCHAR(24) NOT NULL DEFAULT 'WAITING', page_token TEXT NULL, page_history_json JSON NULL, scan_generation INT NOT NULL DEFAULT 0,
 lease_token CHAR(36) NULL, lease_expires_at DATETIME(3) NULL, next_attempt_at DATETIME(3) NULL,
 attempts INT NOT NULL DEFAULT 0, error_code VARCHAR(64) NULL, summary_json JSON NULL,
 started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), pull_finished_at DATETIME(3) NULL,
 processing_finished_at DATETIME(3) NULL, integration_finalized_at DATETIME(3) NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 KEY ix_email_runs_owner(firebase_id,integration_id), KEY ix_email_runs_due(pull_state,next_attempt_at,lease_expires_at)
) ENGINE=InnoDB;
CREATE TABLE email_import_items (
 id CHAR(36) PRIMARY KEY, run_id CHAR(36) NOT NULL, message_id VARCHAR(128) NOT NULL,
 part_path VARCHAR(160) NOT NULL, state VARCHAR(24) NOT NULL DEFAULT 'DISCOVERED', filename VARCHAR(512) NULL,
 mime_type VARCHAR(128) NULL, source_metadata_json JSON NULL, imported_document_id INT NULL, error_code VARCHAR(64) NULL,
 attempts INT NOT NULL DEFAULT 0, next_attempt_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY ux_email_item(run_id,message_id,part_path), KEY ix_email_items_work(run_id,state,next_attempt_at),
 CONSTRAINT fk_email_item_run FOREIGN KEY(run_id) REFERENCES email_import_runs(id),
 CONSTRAINT fk_email_item_import FOREIGN KEY(imported_document_id) REFERENCES imported_documents(id)
) ENGINE=InnoDB;
ALTER TABLE imported_documents
 MODIFY drive_file_id VARCHAR(255) NULL, MODIFY drive_file_name VARCHAR(512) NULL, MODIFY drive_folder_id VARCHAR(255) NULL,
 ADD email_work_state VARCHAR(32) NOT NULL DEFAULT 'LEGACY', ADD email_decision VARCHAR(24) NULL,
 ADD email_policy_version VARCHAR(32) NULL, ADD email_decided_at DATETIME(3) NULL, ADD email_run_id CHAR(36) NULL,
 ADD email_lease_token CHAR(36) NULL, ADD email_lease_expires_at DATETIME(3) NULL,
 ADD email_next_at DATETIME(3) NULL, ADD email_attempts INT NOT NULL DEFAULT 0,
 ADD email_ai_attempt_id CHAR(36) NULL, ADD email_ai_state VARCHAR(24) NOT NULL DEFAULT 'NOT_SENT',
 ADD email_result_json JSON NULL, ADD email_claim_id INT NULL, ADD email_error_code VARCHAR(64) NULL,
 ADD email_upload_tag CHAR(36) NULL, ADD email_deleted_at DATETIME(3) NULL,
 ADD KEY ix_email_import_work(email_work_state,email_next_at,email_lease_expires_at);
-- extracted_document.document_type is VARCHAR(32) in the checked-in entity.
-- Verify the actual target column before applying; if ENUM, prepare a separate
-- explicit extension preserving every existing value. No automatic backfill/job.
