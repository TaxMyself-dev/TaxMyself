-- Apply explicitly before enabling FEEZBACK_LIFECYCLE_ENABLED. No existing table/data is changed.
CREATE TABLE IF NOT EXISTS feezback_lifecycle (
  firebase_id varchar(255) NOT NULL,
  evidence json NULL,
  entitlement_key varchar(500) NULL,
  next_check_at datetime NOT NULL,
  generation int NOT NULL DEFAULT 0,
  lease_token varchar(36) NULL,
  lease_until datetime NULL,
  attempts int NOT NULL DEFAULT 0,
  disconnect_requested tinyint NOT NULL DEFAULT 0,
  last_action varchar(40) NULL,
  last_error varchar(80) NULL,
  requested_by varchar(255) NULL,
  requested_at datetime NULL,
  PRIMARY KEY (firebase_id),
  KEY ix_feezback_lifecycle_due (next_check_at)
) ENGINE=InnoDB;
