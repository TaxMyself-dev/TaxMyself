-- PREPARED ONLY. Requires separate schema authorization. No backfill or existing-work migration.
CREATE TABLE IF NOT EXISTS document_processing_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  sequence BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identity_key CHAR(64) NOT NULL,
  owner VARCHAR(255) NOT NULL, business VARCHAR(255) NOT NULL, actor VARCHAR(255) NOT NULL,
  purpose VARCHAR(32) NOT NULL, source VARCHAR(32) NOT NULL, state VARCHAR(32) NOT NULL,
  content_hash CHAR(64) NOT NULL, filename VARCHAR(512) NOT NULL, mime_type VARCHAR(255) NOT NULL, size BIGINT NOT NULL,
  drive_file_id VARCHAR(255) NULL, drive_folder_id VARCHAR(255) NULL,
  provider VARCHAR(32) NOT NULL, model VARCHAR(100) NOT NULL, policy_version VARCHAR(100) NOT NULL, capacity_key VARCHAR(120) NOT NULL,
  interactive TINYINT NOT NULL DEFAULT 0, context_json JSON NULL, result_json JSON NULL, completion_json JSON NULL,
  claim_id INT NULL, attempt_id CHAR(36) NULL, lease_token CHAR(36) NULL, lease_expires_at DATETIME(3) NULL,
  attempts INT NOT NULL DEFAULT 0, completion_attempts INT NOT NULL DEFAULT 0, reserved_input BIGINT NOT NULL DEFAULT 0, reserved_output BIGINT NOT NULL DEFAULT 0,
  usage_json JSON NULL, timings_json JSON NULL, error_code VARCHAR(100) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  started_at DATETIME(3) NULL, ai_started_at DATETIME(3) NULL, finished_at DATETIME(3) NULL, next_at DATETIME(3) NULL, expires_at DATETIME(3) NULL,
  UNIQUE KEY ux_document_job_sequence (sequence), UNIQUE KEY ux_document_job_identity (identity_key),
  KEY ix_document_job_dispatch (capacity_key,state,next_at,sequence),
  KEY ix_document_job_tenant (owner,business,state,interactive,sequence), KEY ix_document_job_lease (state,lease_expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS document_ai_capacity (
  capacity_key VARCHAR(120) NOT NULL PRIMARY KEY, state_json JSON NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
