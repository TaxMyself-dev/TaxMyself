-- Executed with explicit approval on keepintax-dev on 2026-10-25 only.
-- NOT executed on production. Not part of TypeORM synchronize.
CREATE TABLE lychee_intake_events (
  event_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  channel_id VARCHAR(255) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  sender_phone VARCHAR(32) NOT NULL,
  payload JSON NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  firebase_id VARCHAR(255) NULL,
  business_number VARCHAR(255) NULL,
  business_choices JSON NULL,
  prompt_whatsapp_message_id VARCHAR(255) NULL,
  content LONGBLOB NULL,
  filename VARCHAR(200) NULL,
  mime_type VARCHAR(100) NULL,
  drive_file_id VARCHAR(255) NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error VARCHAR(100) NULL,
  lease_token CHAR(36) NULL,
  lease_until DATETIME NULL,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_lychee_lease (lease_token),
  KEY ix_lychee_queue (status, next_attempt_at),
  KEY ix_lychee_prompt (prompt_whatsapp_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
