-- Document recipient email outbox, 2026-11-25.
-- Explicitly approved for preparation ONLY. Do not execute without separate approval.
-- Apply once before enabling DOCUMENT_EMAIL_QUEUE_ENABLED=true.
-- No entity registration: TypeORM synchronize cannot create/change this table.
CREATE TABLE IF NOT EXISTS document_email_outbox (
  id int NOT NULL AUTO_INCREMENT,
  document_id int NOT NULL,
  payload json NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'PENDING',
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at datetime(3) NOT NULL,
  lease_token varchar(36) NULL,
  lease_until datetime(3) NULL,
  last_error varchar(64) NULL,
  created_at datetime(3) NOT NULL,
  updated_at datetime(3) NOT NULL,
  sent_at datetime(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_document_email_document (document_id),
  UNIQUE KEY uq_document_email_lease (lease_token),
  KEY ix_document_email_due (state, next_attempt_at),
  KEY ix_document_email_lease_expiry (state, lease_until)
) ENGINE=InnoDB;
